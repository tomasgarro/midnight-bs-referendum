import { beforeEach, describe, expect, it } from "vitest";
import { deriveProfileId } from "../integration/profile";

describe("profile identity", () => {
  beforeEach(() => localStorage.clear());

  it("creates an app-scoped Passport identifier without exposing the contract address", () => {
    const session = {
      requestId: "request-1",
      nonce: "nonce-1",
      origin: "https://midnightpassport.com",
      passportContract: { address: "mn_contract_very_public_but_not_for_ui", network: "preview" },
    };
    const first = deriveProfileId(session);
    const second = deriveProfileId(session);
    expect(first).toBe(second);
    expect(first).toMatch(/^passport-/);
    expect(first).not.toContain(session.passportContract.address);
  });

  it("uses a stable local profile when Passport is not connected", () => {
    expect(deriveProfileId(null)).toBe(deriveProfileId(null));
    expect(deriveProfileId(null)).toMatch(/^local-/);
  });
});
