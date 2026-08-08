import { describe, expect, it } from "vitest";
import { getPreviewReadiness } from "../integration/preview";

describe("Preview readiness", () => {
  const base = {
    appMode: "preview" as const,
    contractAddress: "mn_contract_test",
    walletConnected: true,
    providersReady: true,
    providersError: null,
  };

  it("requires a deployed contract before wallet approval", () => {
    const readiness = getPreviewReadiness({ ...base, contractAddress: null });
    expect(readiness.state).toBe("blocked");
    expect(readiness.message).toContain("VITE_MIDNIGHT_CONTRACT_ADDRESS");
  });

  it("reports wallet and provider prerequisites separately", () => {
    expect(getPreviewReadiness({ ...base, walletConnected: false }).label).toBe("Preview requiere wallet");
    expect(getPreviewReadiness({ ...base, providersReady: false }).state).toBe("loading");
    expect(getPreviewReadiness({ ...base, providersError: "indexer unavailable" }).message).toContain("indexer unavailable");
  });

  it("does not block demo mode on Preview prerequisites", () => {
    const readiness = getPreviewReadiness({ ...base, appMode: "demo", contractAddress: null, walletConnected: false });
    expect(readiness.state).toBe("demo");
    expect(readiness.label).toBe("Prototipo local");
  });
});
