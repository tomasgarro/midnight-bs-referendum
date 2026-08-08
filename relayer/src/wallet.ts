import WebSocket from "ws";
// The wallet SDK's indexer client expects a global WebSocket, which Node does
// not provide in the shape it wants. This must run before the SDK is used.
(globalThis as unknown as { WebSocket: unknown }).WebSocket ??= WebSocket;

import * as ledger from "@midnight-ntwrk/ledger-v8";
import { InMemoryTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  WalletFacade,
  WalletEntrySchema,
  type DefaultConfiguration,
} from "@midnight-ntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey as UnshieldedPublicKey,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import type { RelayerConfig } from "./config.js";

export interface RelayerWallet {
  facade: WalletFacade;
  secretKeys: {
    shieldedSecretKeys: ledger.ZswapSecretKeys;
    dustSecretKey: ledger.DustSecretKey;
  };
  /**
   * Needed to sign DUST registration: only the owner of the NIGHT UTXOs can
   * register them, so no other wallet can do it on the relayer's behalf.
   */
  unshieldedKeystore: ReturnType<typeof createKeystore>;
  stop(): Promise<void>;
}

/** How long a balanced transaction stays valid before the network drops it. */
export const BALANCE_TTL_MS = 60 * 60 * 1000;

export async function startRelayerWallet(config: RelayerConfig): Promise<RelayerWallet> {
  const seed = Buffer.from(config.seedHex, "hex");
  const hd = HDWallet.fromSeed(seed);
  if (hd.type !== "seedOk") {
    throw new Error("RELAYER_SEED could not be turned into an HD wallet.");
  }

  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  // Drop the root key as soon as the three role keys exist, so it does not sit
  // in memory for the lifetime of a long-running server.
  hd.hdWallet.clear();
  if (derived.type !== "keysDerived") {
    throw new Error("Could not derive the relayer role keys from the seed.");
  }

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);

  const configuration: DefaultConfiguration = {
    networkId: config.networkId,
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL(config.relayUrl),
    provingServerUrl: new URL(config.provingServerUrl),
    indexerClientConnection: {
      indexerHttpUrl: config.indexerHttpUrl,
      indexerWsUrl: config.indexerWsUrl,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };

  const unshieldedKeystore = createKeystore(
    derived.keys[Roles.NightExternal],
    configuration.networkId,
  );

  const facade = await WalletFacade.init({
    configuration,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        UnshieldedPublicKey.fromKeyStore(unshieldedKeystore),
      ),
    // The dust parameters argument is mandatory; omitting it fails at runtime.
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  await facade.start(shieldedSecretKeys, dustSecretKey);

  return {
    facade,
    secretKeys: { shieldedSecretKeys, dustSecretKey },
    unshieldedKeystore,
    stop: () => facade.stop(),
  };
}

/**
 * What `WalletProvider.balanceTx` hands over: proven, but not yet bound. Its
 * binding tag is `embedded-fr`, not the `pedersen-schnorr` of a finalized
 * transaction, so it must be deserialized as PreBinding — reading it as
 * finalized fails with a header-tag mismatch.
 */
export type UnboundTransaction = ledger.Transaction<
  ledger.SignatureEnabled,
  ledger.Proof,
  ledger.PreBinding
>;

/**
 * Balances a proven-but-unfunded transaction against the relayer's own coins
 * and finalizes it, so the citizen never needs NIGHT, DUST, or a wallet.
 *
 * The transaction arrives already proven: the relayer supplies fees, not
 * authority. The referendum contract authorises `castVote` on Merkle
 * membership and the nullifier, never on who submitted it, so paying the fee
 * grants the relayer no power over the ballot.
 */
export async function balanceAndFinalize(
  wallet: RelayerWallet,
  tx: UnboundTransaction,
): Promise<ledger.FinalizedTransaction> {
  const recipe = await wallet.facade.balanceUnboundTransaction(tx, wallet.secretKeys, {
    ttl: new Date(Date.now() + BALANCE_TTL_MS),
  });
  return wallet.facade.finalizeRecipe(recipe);
}

/** Proven but unbound — what arrives at /balance. */
export function deserializeUnbound(hex: string): UnboundTransaction {
  return ledger.Transaction.deserialize(
    "signature",
    "proof",
    "pre-binding",
    Uint8Array.from(Buffer.from(hex, "hex")),
  );
}

/** Fully bound — what arrives at /submit. */
export function deserializeFinalized(hex: string): ledger.FinalizedTransaction {
  return ledger.Transaction.deserialize(
    "signature",
    "proof",
    "binding",
    Uint8Array.from(Buffer.from(hex, "hex")),
  );
}

export function serializeFinalized(tx: ledger.FinalizedTransaction): string {
  return Buffer.from(tx.serialize()).toString("hex");
}
