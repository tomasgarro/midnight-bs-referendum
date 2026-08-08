import type { PassportSession } from "midnight-referendum-api";

export const PASSPORT_PROFILE_PROTOCOL = "org.midnight.passport.profile/v1" as const;
export const PASSPORT_PROFILE_FIELDS = [
  "displayName",
  "passportContract",
  "midnightAddresses",
] as const;
export type PassportProfileField = (typeof PASSPORT_PROFILE_FIELDS)[number];

/**
 * Passport arms one consent surface per window load and reuses its window by
 * name, so a later payment popup navigates the window the user already
 * connected with instead of stacking a second one beside it.
 */
const PASSPORT_WINDOW_NAME = "midnight-passport";
/**
 * First-time passkey onboarding happens inside the Passport window while we
 * wait. The reference client budgets 180 s; anything shorter abandons a user
 * who is still creating their Passport.
 */
const DEFAULT_TIMEOUT_MS = 180_000;
/** A closed popup never answers, and no message says so. */
const POPUP_POLL_MS = 500;

type PassportProfile = {
  displayName?: string;
  passportContract?: { address: string; network: string };
  midnightAddresses?: {
    unshielded: string;
    shielded?: string;
    dust?: string;
  };
};

type HandshakePair = { requestId: string; nonce: string };

type ProfileReady = {
  protocol: typeof PASSPORT_PROFILE_PROTOCOL;
  type: "passport.profile.ready";
  requestId: string;
  nonce: string;
};

type ProfileResponse = {
  protocol: typeof PASSPORT_PROFILE_PROTOCOL;
  type: "passport.profile.response";
  requestId: string;
  nonce: string;
  approved: boolean;
  profile?: PassportProfile;
  error?: "denied" | "profile_unavailable" | "invalid_request";
};

type ProfileRequest = {
  protocol: typeof PASSPORT_PROFILE_PROTOCOL;
  type: "passport.profile.request";
  requestId: string;
  nonce: string;
  fields: PassportProfileField[];
};

type ProfileHello = {
  protocol: typeof PASSPORT_PROFILE_PROTOCOL;
  type: "passport.profile.hello";
};

export interface PassportBridgeOptions {
  passportOrigin?: string;
  timeoutMs?: number;
  openPassport?: (url: string, windowName: string) => Window | null;
  sourceWindow?: Window;
}

export class PassportBridgeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unavailable"
      | "timeout"
      | "denied"
      | "closed"
      | "invalid_response"
      | "invalid_configuration"
      | "invalid_relying_party_origin",
  ) {
    super(message);
    this.name = "PassportBridgeError";
  }
}

export function getPassportOriginError(sourceWindow: Window = window): string | null {
  const location = sourceWindow.location;
  const hostname = location?.hostname ?? "";
  const isLocalhost = hostname === "localhost";
  const isHttps = location?.protocol === "https:";

  if (isHttps || (isLocalhost && location?.protocol === "http:")) return null;
  if (hostname === "127.0.0.1" || hostname === "::1") {
    return "Passport requiere localhost o HTTPS. Abrí http://localhost:4173 en lugar de 127.0.0.1.";
  }
  return "Passport requiere una conexión HTTPS para crear o usar tu passkey.";
}

export function isPassportEmbedded(sourceWindow: Window, passportOrigin: string): boolean {
  if (sourceWindow.parent === sourceWindow) return false;

  try {
    const ancestorOrigins = sourceWindow.location?.ancestorOrigins;
    if (ancestorOrigins && Array.from(ancestorOrigins).some((origin) => origin === passportOrigin)) {
      return true;
    }
  } catch {
    // Cross-origin access can make ancestorOrigins unavailable.
  }

  try {
    return new URL(sourceWindow.document?.referrer ?? "").origin === passportOrigin;
  } catch {
    return false;
  }
}

function boundedString(value: unknown, max = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isField(value: unknown): value is PassportProfileField {
  return (
    typeof value === "string" &&
    (PASSPORT_PROFILE_FIELDS as readonly string[]).includes(value)
  );
}

function isReady(value: unknown): value is ProfileReady {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.protocol === PASSPORT_PROFILE_PROTOCOL &&
    message.type === "passport.profile.ready" &&
    boundedString(message.requestId, 256) &&
    boundedString(message.nonce, 256)
  );
}

function parseProfile(value: unknown): PassportProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const profile: PassportProfile = {};

  if (input.displayName !== undefined) {
    if (!boundedString(input.displayName, 256)) return null;
    profile.displayName = input.displayName;
  }
  if (input.passportContract !== undefined) {
    if (!input.passportContract || typeof input.passportContract !== "object") return null;
    const contract = input.passportContract as Record<string, unknown>;
    if (!boundedString(contract.address) || !boundedString(contract.network, 256)) return null;
    profile.passportContract = {
      address: contract.address,
      network: contract.network,
    };
  }
  if (input.midnightAddresses !== undefined) {
    if (!input.midnightAddresses || typeof input.midnightAddresses !== "object") return null;
    const addresses = input.midnightAddresses as Record<string, unknown>;
    if (!boundedString(addresses.unshielded)) return null;
    const parsed: NonNullable<PassportProfile["midnightAddresses"]> = {
      unshielded: addresses.unshielded,
    };
    for (const field of ["shielded", "dust"] as const) {
      if (addresses[field] !== undefined) {
        if (!boundedString(addresses[field])) return null;
        parsed[field] = addresses[field] as string;
      }
    }
    profile.midnightAddresses = parsed;
  }
  return profile;
}

function parseResponse(value: unknown): ProfileResponse | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (
    message.protocol !== PASSPORT_PROFILE_PROTOCOL ||
    message.type !== "passport.profile.response" ||
    !boundedString(message.requestId, 256) ||
    !boundedString(message.nonce, 256) ||
    typeof message.approved !== "boolean"
  ) {
    return null;
  }
  if (message.approved) {
    const profile = parseProfile(message.profile);
    return profile ? { ...message, profile } as ProfileResponse : null;
  }
  if (!["denied", "profile_unavailable", "invalid_request"].includes(String(message.error))) {
    return null;
  }
  return { ...message } as ProfileResponse;
}

function randomHex(bytes = 24): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function profileRequest(
  pair: HandshakePair,
  fields: PassportProfileField[],
): ProfileRequest {
  return {
    protocol: PASSPORT_PROFILE_PROTOCOL,
    type: "passport.profile.request",
    requestId: pair.requestId,
    nonce: pair.nonce,
    fields,
  };
}

const HELLO: ProfileHello = {
  protocol: PASSPORT_PROFILE_PROTOCOL,
  type: "passport.profile.hello",
};

export function passportDenialMessage(error: ProfileResponse["error"]): string {
  switch (error) {
    case "denied":
      return "No aprobaste el pedido de perfil en Passport.";
    case "profile_unavailable":
      return "Passport todavía no tiene un perfil para compartir. Completá el onboarding y probá otra vez.";
    case "invalid_request":
      return "Passport ya tiene un pedido abierto para esta app. Resolvelo en Passport antes de reintentar.";
    default:
      return "Passport no aprobó el pedido de perfil.";
  }
}

/**
 * Embedded Passport mints the requestId/nonce pair itself and broadcasts
 * `ready` unprompted every 800 ms until the frame answers, capped at ~32 s.
 * Any reply stops the broadcast, so the pair has to be captured by a listener
 * that is already running — not by one installed when the user finally presses
 * "connect". This watcher latches the first pair it sees, acknowledges it, and
 * hands that same pair to every later profile request, which is what Passport
 * recognises as bound to the handshake it issued.
 */
class EmbeddedHandshakeWatcher {
  private pair: HandshakePair | null = null;
  private waiting: ((pair: HandshakePair) => void)[] = [];

  constructor(
    private readonly origin: string,
    private readonly sourceWindow: Window,
  ) {
    this.sourceWindow.addEventListener("message", this.onMessage);
  }

  private readonly onMessage = (event: MessageEvent) => {
    if (event.origin !== this.origin) return;
    if (event.source !== this.sourceWindow.parent) return;
    if (!isReady(event.data)) return;
    // `ready` is idempotent and can arrive late, mid-flow. A repeat must never
    // reset a handshake that is already established.
    if (this.pair) return;

    this.pair = { requestId: event.data.requestId, nonce: event.data.nonce };
    this.sourceWindow.parent.postMessage(HELLO, this.origin);
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) resolve(this.pair);
  };

  current(): HandshakePair | null {
    return this.pair;
  }

  settled(onAbort: (cancel: () => void) => void): Promise<HandshakePair> {
    if (this.pair) return Promise.resolve(this.pair);
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      onAbort(() => {
        this.waiting = this.waiting.filter((entry) => entry !== resolve);
      });
    });
  }

  dispose() {
    this.sourceWindow.removeEventListener("message", this.onMessage);
  }
}

const watchers = new Map<string, EmbeddedHandshakeWatcher>();

function embeddedWatcher(origin: string, sourceWindow: Window): EmbeddedHandshakeWatcher {
  let watcher = watchers.get(origin);
  if (!watcher) {
    watcher = new EmbeddedHandshakeWatcher(origin, sourceWindow);
    watchers.set(origin, watcher);
  }
  return watcher;
}

/**
 * Starts listening for Passport's embedded handshake as early as possible.
 * Safe to call when the app is not framed by Passport: it never fires.
 */
export function startPassportHandshakeWatch(
  passportOrigin: string,
  sourceWindow: Window = window,
): void {
  let origin: string;
  try {
    origin = new URL(passportOrigin).origin;
  } catch {
    // An invalid configured origin surfaces on connect(), not here.
    return;
  }
  if (!isPassportEmbedded(sourceWindow, origin)) return;
  embeddedWatcher(origin, sourceWindow);
}

/** Test seam: drops cached embedded watchers between cases. */
export function resetPassportHandshakeWatch(): void {
  for (const watcher of watchers.values()) watcher.dispose();
  watchers.clear();
}

/**
 * Thin client for Passport's public profile bridge. It intentionally does not
 * read Passport storage or derive the anonymous voter secret from the profile.
 */
export class PassportIdentityBridge {
  private readonly origin: string;
  private readonly timeoutMs: number;
  private readonly sourceWindow: Window;
  private readonly openPassport: (url: string, windowName: string) => Window | null;

  constructor(options: PassportBridgeOptions = {}) {
    const fallbackWindow = options.sourceWindow ?? window;
    const configuredOrigin = options.passportOrigin ?? "https://midnightpassport.com";
    try {
      this.origin = new URL(configuredOrigin).origin;
    } catch {
      throw new PassportBridgeError("Passport origin is not a valid URL", "invalid_configuration");
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sourceWindow = fallbackWindow;
    this.openPassport =
      options.openPassport ??
      ((url, windowName) => fallbackWindow.open(url, windowName, "popup,width=620,height=780"));
  }

  get embedded(): boolean {
    return isPassportEmbedded(this.sourceWindow, this.origin);
  }

  async connect(
    fields: PassportProfileField[] = ["displayName", "passportContract", "midnightAddresses"],
  ): Promise<PassportSession> {
    const relyingPartyError = getPassportOriginError(this.sourceWindow);
    if (relyingPartyError) {
      throw new PassportBridgeError(relyingPartyError, "invalid_relying_party_origin");
    }
    const requestedFields = [...new Set(fields)].filter(isField);
    if (requestedFields.length === 0) {
      throw new PassportBridgeError("Passport profile requires at least one field", "invalid_configuration");
    }

    return this.embedded
      ? this.connectEmbedded(requestedFields)
      : this.connectStandalone(requestedFields);
  }

  private session(pair: HandshakePair, response: ProfileResponse): PassportSession {
    return {
      requestId: pair.requestId,
      nonce: pair.nonce,
      origin: this.origin,
      displayName: response.profile?.displayName,
      passportContract: response.profile?.passportContract,
      midnightAddresses: response.profile?.midnightAddresses,
    };
  }

  private connectEmbedded(fields: PassportProfileField[]): Promise<PassportSession> {
    const parent = this.sourceWindow.parent;
    const watcher = embeddedWatcher(this.origin, this.sourceWindow);

    return new Promise<PassportSession>((resolve, reject) => {
      let settled = false;
      let pair = watcher.current();
      const aborts: (() => void)[] = [];
      const finish = (error?: Error, session?: PassportSession) => {
        if (settled) return;
        settled = true;
        this.sourceWindow.removeEventListener("message", onMessage);
        window.clearTimeout(timeout);
        for (const abort of aborts) abort();
        if (error) reject(error);
        else resolve(session!);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== this.origin || event.source !== parent) return;
        const response = parseResponse(event.data);
        if (!response || !pair) return;
        if (response.requestId !== pair.requestId || response.nonce !== pair.nonce) return;
        if (!response.approved) {
          finish(new PassportBridgeError(passportDenialMessage(response.error), "denied"));
          return;
        }
        finish(undefined, this.session(pair, response));
      };

      const timeout = window.setTimeout(() => {
        finish(
          new PassportBridgeError(
            "Passport no respondió a tiempo. Volvé a intentarlo desde la app de Passport.",
            "timeout",
          ),
        );
      }, this.timeoutMs);

      this.sourceWindow.addEventListener("message", onMessage);

      void watcher.settled((cancel) => aborts.push(cancel)).then((established) => {
        if (settled) return;
        pair = established;
        parent.postMessage(profileRequest(established, fields), this.origin);
      });
    });
  }

  private connectStandalone(fields: PassportProfileField[]): Promise<PassportSession> {
    const pair: HandshakePair = { requestId: crypto.randomUUID(), nonce: randomHex() };
    const query = new URLSearchParams({
      passportRequestId: pair.requestId,
      passportNonce: pair.nonce,
    });
    const popup = this.openPassport(`${this.origin}/?${query.toString()}`, PASSPORT_WINDOW_NAME);
    if (!popup) {
      return Promise.reject(
        new PassportBridgeError(
          "El navegador bloqueó la ventana de Passport. Permití las ventanas emergentes y probá otra vez.",
          "unavailable",
        ),
      );
    }

    return new Promise<PassportSession>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, session?: PassportSession) => {
        if (settled) return;
        settled = true;
        this.sourceWindow.removeEventListener("message", onMessage);
        window.clearTimeout(timeout);
        window.clearInterval(closedPoll);
        if (error) reject(error);
        else resolve(session!);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== this.origin || event.source !== popup) return;

        if (isReady(event.data)) {
          if (event.data.requestId !== pair.requestId || event.data.nonce !== pair.nonce) return;
          popup.postMessage(profileRequest(pair, fields), this.origin);
          return;
        }

        const response = parseResponse(event.data);
        if (!response || response.requestId !== pair.requestId || response.nonce !== pair.nonce) return;
        if (!response.approved) {
          finish(new PassportBridgeError(passportDenialMessage(response.error), "denied"));
          return;
        }
        finish(undefined, this.session(pair, response));
      };

      // A user who closes the Passport window is not a timeout; say so at once
      // rather than leaving the flow spinning for the full budget.
      const closedPoll = window.setInterval(() => {
        if (popup.closed) {
          finish(
            new PassportBridgeError(
              "La ventana de Passport se cerró antes de aprobar el perfil.",
              "closed",
            ),
          );
        }
      }, POPUP_POLL_MS);

      const timeout = window.setTimeout(() => {
        finish(
          new PassportBridgeError(
            "Passport no respondió a tiempo. Volvé a abrir Passport e intentá de nuevo.",
            "timeout",
          ),
        );
      }, this.timeoutMs);

      this.sourceWindow.addEventListener("message", onMessage);
    });
  }
}

export function isPassportProfileResponse(value: unknown): boolean {
  return parseResponse(value) !== null;
}
