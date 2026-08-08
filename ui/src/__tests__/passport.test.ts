import { describe, expect, it, vi } from "vitest";
import { getPassportOriginError, PassportBridgeError, PassportIdentityBridge, PASSPORT_PROFILE_PROTOCOL } from "../integration/passport";

describe("PassportIdentityBridge", () => {
  it("binds profile responses to origin, source, request id and nonce", async () => {
    const postMessage = vi.fn();
    const popup = { postMessage } as unknown as Window;
    const bridge = new PassportIdentityBridge({
      passportOrigin: "https://midnightpassport.com",
      timeoutMs: 200,
      openPassport: () => popup,
    });

    const pending = bridge.connect(["displayName"]);
    const url = postMessage.mock.calls.length;
    expect(url).toBe(0);
    const popupUrl = (bridge as unknown as { openPassport: (url: string) => Window }).openPassport;
    expect(popupUrl).toBeTypeOf("function");

    // The request id and nonce are encoded in the popup URL. The bridge waits
    // for Passport's ready message before sending the scoped request.
    const openSpy = vi.spyOn(window, "open").mockReturnValue(popup);
    void openSpy;
    // The injected opener has already been called; recover its URL from the
    // test double by constructing a second bridge with an observable opener.
    let opened = "";
    const bridge2 = new PassportIdentityBridge({
      passportOrigin: "https://midnightpassport.com",
      timeoutMs: 200,
      openPassport: (openedUrl) => { opened = openedUrl; return popup; },
    });
    const resultPromise = bridge2.connect();
    const query = new URL(opened).searchParams;
    const requestId = query.get("passportRequestId")!;
    const nonce = query.get("passportNonce")!;
    const ready = { protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.ready", requestId, nonce };
    window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", source: popup, data: ready }));
    window.dispatchEvent(new MessageEvent("message", { origin: "https://midnightpassport.com", source: popup, data: ready }));
    const request = postMessage.mock.calls.at(-1)?.[0] as { requestId: string; nonce: string };
    expect(request.requestId).toBe(requestId);
    expect(request.nonce).toBe(nonce);
    expect((postMessage.mock.calls.at(-1)?.[0] as { fields: string[] }).fields).toContain("passportContract");
    window.dispatchEvent(new MessageEvent("message", { origin: "https://midnightpassport.com", source: popup, data: { protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.response", requestId, nonce: "stale", approved: true, profile: { displayName: "Wrong" } } }));
    window.dispatchEvent(new MessageEvent("message", { origin: "https://midnightpassport.com", source: popup, data: { protocol: PASSPORT_PROFILE_PROTOCOL, type: "passport.profile.response", requestId, nonce, approved: true, profile: { displayName: "Bubbles" } } }));
    await expect(resultPromise).resolves.toMatchObject({ displayName: "Bubbles", origin: "https://midnightpassport.com" });
    await expect(pending).rejects.toBeInstanceOf(PassportBridgeError);
    openSpy.mockRestore();
  });

  it("explains why 127.0.0.1 cannot be used for a Passport passkey", () => {
    const localAddress = { location: { hostname: "127.0.0.1", protocol: "http:" } } as unknown as Window;
    expect(getPassportOriginError(localAddress)).toContain("localhost:4173");
    expect(getPassportOriginError({ location: { hostname: "localhost", protocol: "http:" } } as unknown as Window)).toBeNull();
    expect(getPassportOriginError({ location: { hostname: "preview.example", protocol: "https:" } } as unknown as Window)).toBeNull();
  });
});
