/// <reference types="vite/client" />

import type { InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
  readonly VITE_MIDNIGHT_NETWORK?: string;
  readonly VITE_MIDNIGHT_CONTRACT_ADDRESS?: string;
  readonly VITE_MIDNIGHT_PROOF_SERVER_URL?: string;
  readonly VITE_MIDNIGHT_EXPLORER_BASE_URL?: string;
  readonly VITE_MIDNIGHT_INDEXER_URL?: string;
  readonly VITE_MIDNIGHT_INDEXER_WS_URL?: string;
  readonly VITE_PASSPORT_ORIGIN?: string;
  /** Set to run the wallet-less sponsored-relayer path. */
  readonly VITE_RELAYER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    // `@midnight-ntwrk/dapp-connector-api` already augments this on import; the
    // redeclaration keeps `window.midnight` typed project-wide. It must use the
    // SAME index signature as the package (`[key: string]: InitialAPI` â€” no
    // `| undefined` and no extra named keys) or TypeScript raises TS2717.
    // Each wallet is installed under its own key (a UUID); Lace also aliases
    // itself at `mnLace`.
    midnight?: { [key: string]: InitialAPI };
  }
}
