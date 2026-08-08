import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

const STORAGE_KEY = "midnight-referendum_wallet_autoconnect";
const TARGET_NETWORK_ID = import.meta.env.VITE_MIDNIGHT_NETWORK?.trim() || "preview";

export type WalletConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface WalletState {
  status: WalletConnectionStatus;
  connectedApi: ConnectedAPI | null;
  shieldedAddress: string | null;
  coinPublicKey: string | null;
  encryptionPublicKey: string | null;
  networkId: string | null;
  dustBalance: bigint | null;
  dustCap: bigint | null;
  error: string | null;
}

export interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

function findWallet(): InitialAPI | undefined {
  if (typeof window === "undefined" || !window.midnight) return undefined;
  // Each wallet is injected under its own key (a UUID; Lace also aliases itself
  // at `mnLace`). Enumerate and use the first valid wallet; to target a specific
  // wallet, match on `rdns`/`name` instead.
  return Object.values(window.midnight).find(
    (w): w is InitialAPI => w != null && typeof w.connect === "function",
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    status: "disconnected",
    connectedApi: null,
    shieldedAddress: null,
    coinPublicKey: null,
    encryptionPublicKey: null,
    networkId: null,
    dustBalance: null,
    dustCap: null,
    error: null,
  });

  const refreshBalances = useCallback(async () => {
    if (!state.connectedApi || typeof state.connectedApi.getDustBalance !== "function") return;
    try {
      const dust = await state.connectedApi.getDustBalance();
      setState((prev) => ({ ...prev, dustBalance: dust.balance, dustCap: dust.cap }));
    } catch {
      // A wallet may expose the connector without exposing balance APIs yet.
      // Connection should remain usable; the transaction flow will surface any
      // balancing error from the wallet itself.
    }
  }, [state.connectedApi]);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "connecting", error: null }));

    const wallet = findWallet();
    if (!wallet) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error:
          "No encontramos una wallet de Midnight. Instalá Lace o una wallet compatible para continuar.",
      }));
      return;
    }

    try {
      const api = await wallet.connect(TARGET_NETWORK_ID);
      const config = await api.getConfiguration();
      const addresses = await api.getShieldedAddresses();
      let dustBalance: bigint | null = null;
      let dustCap: bigint | null = null;
      try {
        const dust = await api.getDustBalance();
        dustBalance = dust.balance;
        dustCap = dust.cap;
      } catch {
        // Keep the wallet connected when balance discovery is unavailable.
      }

      setState({
        status: "connected",
        connectedApi: api,
        shieldedAddress: addresses.shieldedAddress,
        coinPublicKey: addresses.shieldedCoinPublicKey,
        encryptionPublicKey: addresses.shieldedEncryptionPublicKey,
        networkId: config.networkId,
        dustBalance,
        dustCap,
        error: null,
      });

      localStorage.setItem(STORAGE_KEY, "true");
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "reason" in err
          ? (err as { reason: string }).reason
          : "Failed to connect to wallet";
      setState((prev) => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      status: "disconnected",
      connectedApi: null,
      shieldedAddress: null,
      coinPublicKey: null,
      encryptionPublicKey: null,
      networkId: null,
      dustBalance: null,
      dustCap: null,
      error: null,
    });
  }, []);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") {
      connect();
    }
  }, [connect]);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, refreshBalances }}>
      {children}
    </WalletContext.Provider>
  );
}
