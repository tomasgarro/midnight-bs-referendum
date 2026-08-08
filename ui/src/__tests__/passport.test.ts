import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPassportOriginError,
  isPassportEmbedded,
  PassportBridgeError,
  PassportIdentityBridge,
  PASSPORT_PROFILE_PROTOCOL,
  resetPassportHandshakeWatch,
  startPassportHandshakeWatch,
} from "../integration/passport";

const ORIGIN = "https://midnightpassport.com";

/**
 * A window Passport has framed: `parent` is Passport, and Passport is listed
 * as an ancestor origin. `emit` plays a message Passport posted into the frame.
 */
function embeddedWindow() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const posted: unknown[] = [];
  const parent = { postMessage: (message: unknown) => posted.push(message) };
  const win = {
    parent,
    location: { protocol: "https:", hostname: "referendum.example", ancestorOrigins: [ORIGIN] },
    document: { referrer: "" },
    addEventListener: (_type: string, cb: (event: MessageEvent) => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: (event: MessageEvent) => void) => listeners.delete(cb),
  } as unknown as Window;
  const emit = (data: unknown, source: unknown = parent, origin = ORIGIN) => {
    for (const cb of [...listeners]) cb({ origin, source, data } as MessageEvent);
  };
  return { win, posted, emit };
}

afterEach(() => {
  resetPassportHandshakeWatch();
});

describe("PassportIdentityBridge", () => {
  it("binds profile responses to origin, source, request id and nonce", async () => {
    const postMessage = vi.fn();
    const popup = { postMessage, closed: false } as unknown as Window;
    const bridge = new PassportIdentityBridge({
      passportOrigin: ORIGIN,
      timeoutMs: 200,
      openPassport: () => popup,
    });

    const pending = bridge.connect(["displayName"]);
    expect(postMessage.mock.calls.length).toBe(0);

    // The request id and nonce are encoded in the popup URL. The bridge waits
    // for Passport's ready message before sending the scoped request.
    let opened = "";
    let openedName = "";
    const bridge2 = new PassportIdentityBridge({
      passportOrigin: ORIGIN,
      timeoutMs: 200,
      openPassport: (openedUrl, windowName) => {
        opened = openedUrl;
        openedName = windowName;
        return popup;
      },
    });
    const resultPromise = bridge2.connect();

    // Reusing this one window name navigates the Passport window the user
    // already connected with rather than stacking a second one beside it.
    expect(openedName).toBe("midnight-passport");

    const query = new URL(opened).searchParams;
    const requestId = query.get("passportRequestId")!;
    const nonce = query.get("passportNonce")!;
    const ready = { protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.ready", requestId, nonce };
    window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", source: popup, data: ready }));
    window.dispatchEvent(new MessageEvent("message", { origin: ORIGIN, source: popup, data: ready }));
    const request = postMessage.mock.calls.at(-1)?.[0] as { requestId: string; nonce: string };
    expect(request.requestId).toBe(requestId);
    expect(request.nonce).toBe(nonce);
    expect((postMessage.mock.calls.at(-1)?.[0] as { fields: string[] }).fields).toContain("passportContract");
    window.dispatchEvent(new MessageEvent("message", { origin: ORIGIN, source: popup, data: { protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.response", requestId, nonce: "stale", approved: true, profile: { displayName: "Wrong" } } }));
    window.dispatchEvent(new MessageEvent("message", { origin: ORIGIN, source: popup, data: { protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.response", requestId, nonce, approved: true, profile: { displayName: "Bubbles" } } }));
    await expect(resultPromise).resolves.toMatchObject({ displayName: "Bubbles", origin: ORIGIN });
    await expect(pending).rejects.toBeInstanceOf(PassportBridgeError);
  });

  it("reports a closed Passport window instead of waiting out the timeout", async () => {
    vi.useFakeTimers();
    try {
      const popup = { postMessage: vi.fn(), closed: false } as unknown as Window;
      const bridge = new PassportIdentityBridge({
        passportOrigin: ORIGIN,
        // A real close must not have to wait out the full 180 s budget.
        timeoutMs: 180_000,
        openPassport: () => popup,
      });
      const pending = bridge.connect(["displayName"]);
      // Attach the handler before advancing: the poll rejects inside the tick
      // that advanceTimersByTimeAsync awaits, which would otherwise surface as
      // an unhandled rejection.
      const rejects = expect(pending).rejects.toMatchObject({ code: "closed" });
      (popup as unknown as { closed: boolean }).closed = true;
      await vi.advanceTimersByTimeAsync(600);
      await rejects;
    } finally {
      vi.useRealTimers();
    }
  });

  it("adopts the pair Passport mints when the app is embedded", async () => {
    const { win, posted, emit } = embeddedWindow();
    startPassportHandshakeWatch(ORIGIN, win);

    // Passport mints the pair and broadcasts it unprompted, long before the
    // user presses anything in the app.
    const requestId = "passport-minted-request";
    const nonce = "passport-minted-nonce";
    emit({ protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.ready", requestId, nonce });

    // The ack is what stops Passport's 800 ms re-broadcast.
    expect(posted.at(0)).toMatchObject({ type: "passport.profile.hello" });

    const bridge = new PassportIdentityBridge({
      passportOrigin: ORIGIN,
      timeoutMs: 200,
      sourceWindow: win,
    });
    expect(bridge.embedded).toBe(true);

    const pending = bridge.connect(["displayName"]);
    await Promise.resolve();

    // The request must echo Passport's pair, not one the app minted for itself.
    expect(posted.at(-1)).toMatchObject({ type: "passport.profile.request", requestId, nonce });

    emit({
      protocol: PASSPORT_PROFILE_PROTOCOL,
      type: "passport.profile.response",
      requestId,
      nonce,
      approved: true,
      profile: { displayName: "vecina.night" },
    });
    await expect(pending).resolves.toMatchObject({ displayName: "vecina.night", requestId, nonce });
  });

  it("ignores a repeated ready so a late re-broadcast cannot reset the handshake", async () => {
    const { win, posted, emit } = embeddedWindow();
    startPassportHandshakeWatch(ORIGIN, win);
    const ready = (requestId: string, nonce: string) => ({
      protocol: PASSPORT_PROFILE_PROTOCOL,
      type: "passport.profile.ready",
      requestId,
      nonce,
    });

    emit(ready("first-request", "first-nonce"));
    emit(ready("second-request", "second-nonce"));

    const bridge = new PassportIdentityBridge({ passportOrigin: ORIGIN, timeoutMs: 200, sourceWindow: win });
    const pending = bridge.connect(["displayName"]);
    await Promise.resolve();

    expect(posted.at(-1)).toMatchObject({ requestId: "first-request", nonce: "first-nonce" });
    emit({
      protocol: PASSPORT_PROFILE_PROTOCOL,
      type: "passport.profile.response",
      requestId: "first-request",
      nonce: "first-nonce",
      approved: false,
      error: "denied",
    });
    await expect(pending).rejects.toMatchObject({ code: "denied" });
  });

  it("explains why 127.0.0.1 cannot be used for a Passport passkey", () => {
    const localAddress = { location: { hostname: "127.0.0.1", protocol: "http:" } } as unknown as Window;
    expect(getPassportOriginError(localAddress)).toContain("localhost:4173");
    expect(getPassportOriginError({ location: { hostname: "localhost", protocol: "http:" } } as unknown as Window)).toBeNull();
    expect(getPassportOriginError({ location: { hostname: "preview.example", protocol: "https:" } } as unknown as Window)).toBeNull();
  });

  it("does not treat an arbitrary app iframe as Passport", () => {
    const appFrame = {
      parent: {},
      location: { ancestorOrigins: [] },
      document: { referrer: "https://example.org/embedded" },
    } as unknown as Window;
    const passportFrame = {
      parent: {},
      location: { ancestorOrigins: [ORIGIN] },
      document: { referrer: "" },
    } as unknown as Window;

    expect(isPassportEmbedded(appFrame, ORIGIN)).toBe(false);
    expect(isPassportEmbedded(passportFrame, ORIGIN)).toBe(true);
  });
});
