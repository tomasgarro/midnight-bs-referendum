/**
 * Relayer configuration.
 *
 * The seed is read from the environment and never logged, never returned by
 * an endpoint, and never written to disk by this process. Everything else
 * here is public infrastructure detail.
 */

export interface RelayerConfig {
  seedHex: string;
  networkId: string;
  indexerHttpUrl: string;
  indexerWsUrl: string;
  relayUrl: string;
  provingServerUrl: string;
  host: string;
  port: number;
  /** Exact browser origins allowed to call the relayer. Never "*". */
  allowedOrigins: string[];
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Copy relayer/.env.example to relayer/.env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function loadConfig(): RelayerConfig {
  const seedHex = required("RELAYER_SEED").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(seedHex)) {
    // Fail on shape alone; the value itself must never reach a log line.
    throw new Error("RELAYER_SEED must be 64 hexadecimal characters (32 bytes).");
  }

  return {
    seedHex,
    networkId: optional("RELAYER_NETWORK_ID", "preview"),
    indexerHttpUrl: optional(
      "RELAYER_INDEXER_HTTP_URL",
      "https://indexer.preview.midnight.network/api/v4/graphql",
    ),
    indexerWsUrl: optional(
      "RELAYER_INDEXER_WS_URL",
      "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
    ),
    relayUrl: optional("RELAYER_NODE_URL", "wss://rpc.preview.midnight.network"),
    provingServerUrl: optional("RELAYER_PROOF_SERVER_URL", "http://localhost:6300"),
    host: optional("RELAYER_HOST", "127.0.0.1"),
    port: Number.parseInt(optional("RELAYER_PORT", "8790"), 10),
    allowedOrigins: optional("RELAYER_ALLOWED_ORIGINS", "http://localhost:4173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
