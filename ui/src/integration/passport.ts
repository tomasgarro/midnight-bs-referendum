import type { PassportSession } from "midnight-referendum-api";

export const PASSPORT_PROFILE_PROTOCOL = "org.midnight.passport.profile/v1" as const;
export const PASSPORT_PROFILE_FIELDS = [
  "displayName",
  "passportContract",
  "midnightAddresses",
] as const;
export type PassportProfileField = (typeof PASSPORT_PROFILE_FIELDS)[number];

type PassportProfile = {
  displayName?: string;
  passportContract?: { address: string; network: string };
  midnightAddresses?: {
    unshielded: string;
    shielded?: string;
    dust?: string;
  };
};

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

export interface PassportBridgeOptions {
  passportOrigin?: string;
  timeoutMs?: number;
  openPassport?: (url: string) => Window | null;
  sourceWindow?: Window;
}

export class PassportBridgeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unavailable"
      | "timeout"
      | "denied"
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
  requestId: string,
  nonce: string,
  fields: PassportProfileField[],
): ProfileRequest {
  return {
    protocol: PASSPORT_PROFILE_PROTOCOL,
    type: "passport.profile.request",
    requestId,
    nonce,
    fields,
  };
}

/**
 * Thin client for Passport's public profile bridge. It intentionally does not
 * read Passport storage or derive the anonymous voter secret from the profile.
 */
export class PassportIdentityBridge {
  private readonly origin: string;
  private readonly timeoutMs: number;
  private readonly sourceWindow: Window;
  private readonly openPassport: (url: string) => Window | null;

  constructor(options: PassportBridgeOptions = {}) {
    const fallbackWindow = options.sourceWindow ?? window;
    const configuredOrigin = options.passportOrigin ?? "https://midnightpassport.com";
    try {
      this.origin = new URL(configuredOrigin).origin;
    } catch {
      throw new PassportBridgeError("Passport origin is not a valid URL", "invalid_configuration");
    }
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.sourceWindow = fallbackWindow;
    this.openPassport = options.openPassport ?? ((url) => fallbackWindow.open(url, "midnight-passport-profile", "popup,width=620,height=780"));
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

    const embedded = this.sourceWindow.parent !== this.sourceWindow;
    const requestId = crypto.randomUUID();
    const nonce = randomHex();
    const target = embedded ? this.sourceWindow.parent : null;
    const active = { requestId, nonce };

    let popup: Window | null = null;
    if (!embedded) {
      const query = new URLSearchParams({ passportRequestId: requestId, passportNonce: nonce });
      popup = this.openPassport(`${this.origin}/?${query.toString()}`);
      if (!popup) {
        throw new PassportBridgeError("The browser blocked the Passport window", "unavailable");
      }
    }

    return new Promise<PassportSession>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, session?: PassportSession) => {
        if (settled) return;
        settled = true;
        this.sourceWindow.removeEventListener("message", onMessage);
        window.clearTimeout(timeout);
        if (error) reject(error);
        else resolve(session!);
      };
      const expectedSource = embedded ? target : popup;
      const send = (message: ProfileRequest | { protocol: typeof PASSPORT_PROFILE_PROTOCOL; type: "passport.profile.hello" }) => {
        expectedSource?.postMessage(message, this.origin);
      };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== this.origin || event.source !== expectedSource) return;

        if (isReady(event.data)) {
          if (event.data.requestId !== active.requestId || event.data.nonce !== active.nonce) return;
          if (embedded) {
            send({ protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.hello" });
          }
          send(profileRequest(active.requestId, active.nonce, requestedFields));
          return;
        }

        const response = parseResponse(event.data);
        if (!response || response.requestId !== active.requestId || response.nonce !== active.nonce) return;
        if (!response.approved) {
          finish(new PassportBridgeError(`Passport did not approve the profile request (${response.error})`, "denied"));
          return;
        }
        finish(undefined, {
          requestId: active.requestId,
          nonce: active.nonce,
          origin: this.origin,
          displayName: response.profile?.displayName,
          passportContract: response.profile?.passportContract,
          midnightAddresses: response.profile?.midnightAddresses,
        });
      };
      const timeout = window.setTimeout(() => {
        finish(new PassportBridgeError("Timed out waiting for Midnight Passport", "timeout"));
      }, this.timeoutMs);

      this.sourceWindow.addEventListener("message", onMessage);
      if (embedded && target) {
        // Embedded Passport sends a nonce-bound ready message; standalone
        // Passport sends it after the popup has hydrated its session.
        return;
      }
    });
  }
}

export function isPassportProfileResponse(value: unknown): boolean {
  return parseResponse(value) !== null;
}
