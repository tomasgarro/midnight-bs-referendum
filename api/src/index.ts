import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { toHex, fromHex } from "@midnight-ntwrk/midnight-js-utils";
import {
  createProofProvider,
  type WalletProvider,
  type MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import {
  Transaction,
  type FinalizedTransaction,
} from "@midnight-ntwrk/midnight-js-protocol/ledger";
import type { ChargedState } from "@midnight-ntwrk/compact-runtime";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { catchError, combineLatest, map, retry, throwError, Observable } from "rxjs";
import { browserPrivateStateProvider, inMemoryPrivateStateProvider } from "./private-state.js";
import * as GeneratedReferendum from "./generated/referendum/index.js";
import type {
  AppProviders,
  ContractState,
  DerivedState,
  ImpureCircuitKeys,
  PrivateState,
  ReferendumExecutor,
  TransactionReceipt,
  VoteReveal,
} from "./types.js";
import { PRIVATE_STATE_ID } from "./types.js";

export {
  browserPrivateStateProvider,
  deserializePrivateStateFromStorage,
  inMemoryPrivateStateProvider,
  serializePrivateStateForStorage,
} from "./private-state.js";
export {
  createExternalEligibilityProvider,
  createFixtureEligibilityProvider,
  eligibilityCommitmentForSecret,
} from "./eligibility.js";
export type {
  AppProviders,
  ContractState,
  DerivedState,
  EligibilityAttestation,
  ImpureCircuitKeys,
  PrivateState,
  PassportSession,
  ReferendumExecutor,
  TransactionReceipt,
  VoteCommitment,
  VoteReveal,
} from "./types.js";
export { PRIVATE_STATE_ID } from "./types.js";

export interface ProviderOptions {
  /** Explicit local fallback; never inferred from the node URI. */
  proofServerUri?: string;
  zkConfigBaseUrl?: string;
}

function previewSafeIndexerProvider(
  provider: AppProviders["publicDataProvider"],
): AppProviders["publicDataProvider"] {
  const original = provider.contractStateObservable.bind(provider);
  return {
    ...provider,
    contractStateObservable(address, config) {
      // Preview indexer versions have returned offset:null for a latest
      // subscription. A bounded retry lets the subscription reconnect without
      // changing the endpoint selected by the wallet.
      return original(address, config).pipe(
        retry({ delay: 250, count: 1 }),
        catchError((error: unknown) => {
          if (config.type === "latest") {
            return original(address, { type: "all" });
          }
          return throwError(() => error);
        }),
      );
    },
  };
}

export async function createProviders(
  api: ConnectedAPI,
  options: ProviderOptions = {},
): Promise<AppProviders> {
  const config = await api.getConfiguration();
  setNetworkId(config.networkId);

  const publicDataProvider = previewSafeIndexerProvider(
    indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
  );
  const privateStateProvider =
    typeof window === "undefined"
      ? inMemoryPrivateStateProvider<typeof PRIVATE_STATE_ID, PrivateState>()
      : browserPrivateStateProvider<typeof PRIVATE_STATE_ID, PrivateState>();
  const browserOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const zkConfigProvider = new FetchZkConfigProvider<ImpureCircuitKeys>(
    options.zkConfigBaseUrl ?? `${browserOrigin}/managed/referendum`,
    fetch.bind(globalThis),
  );

  // Wallet-delegated proving is the default. A proof server is an explicit
  // local development fallback and is never derived from substrateNodeUri.
  const proofProvider = options.proofServerUri
    ? httpClientProofProvider<ImpureCircuitKeys>(options.proofServerUri, zkConfigProvider)
    : createProofProvider(
        await api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider()),
      );

  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await api.getShieldedAddresses();
  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
    balanceTx: async (tx, _ttl) => {
      const { tx: balancedHex } = await api.balanceUnsealedTransaction(
        toHex(tx.serialize()),
        {},
      );
      return Transaction.deserialize(
        "signature",
        "proof",
        "binding",
        fromHex(balancedHex),
      ) satisfies FinalizedTransaction;
    },
  };
  const midnightProvider: MidnightProvider = {
    submitTx: async (tx) => {
      await api.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}

export interface ReferendumConfig {
  issuerSecret: Uint8Array;
  organizerSecret: Uint8Array;
  eventId: Uint8Array;
  explorerBaseUrl?: string;
}

export function createReferendumPrivateState(
  config: Pick<ReferendumConfig, "issuerSecret" | "organizerSecret">,
): PrivateState {
  return {
    issuerSecret: config.issuerSecret,
    organizerSecret: config.organizerSecret,
    // Aliases keep old generated artifacts runnable while a new artifact is
    // being synchronized; the new witness names are the supported interface.
    issuer: config.issuerSecret,
    organizer: config.organizerSecret,
  } as PrivateState;
}

function createCompiledReferendum(privateState: PrivateState) {
  const witnesses = {
    issuerSecret: (context: any) => [
      context.privateState,
      context.privateState.issuerSecret ?? context.privateState.issuer,
    ],
    organizerSecret: (context: any) => [
      context.privateState,
      context.privateState.organizerSecret ?? context.privateState.organizer,
    ],
    voterSecret: (context: any) => [context.privateState, context.privateState.voterSecret],
    voterPath: (context: any) => [context.privateState, context.privateState.voterPath],
    voterChoice: (context: any) => [context.privateState, context.privateState.voterChoice],
    voteSalt: (context: any) => [context.privateState, context.privateState.voteSalt],
    revealPath: (context: any) => [context.privateState, context.privateState.revealPath],
  };
  let compiled = CompiledContract.make(
    "referendum",
    GeneratedReferendum.Contract as any,
  ) as any;
  compiled = (CompiledContract.withWitnesses as any)(compiled, witnesses as any);
  return (CompiledContract.withCompiledFileAssets as any)(compiled, "managed/referendum");
}

function receiptFrom(value: any, explorerBaseUrl: string): TransactionReceipt {
  const data = value.public ?? value;
  const txHash = String(data.txHash ?? data.txId);
  return {
    txId: String(data.txId),
    txHash,
    blockHeight: Number(data.blockHeight),
    blockHash: String(data.blockHash),
    blockTimestamp: Number(data.blockTimestamp),
    status: String(data.status),
    explorerUrl: `${explorerBaseUrl.replace(/\/$/, "")}/${txHash}`,
  };
}

/** Midnight.js lifecycle wrapper used by the Preview UI and future Passport executor. */
export function createReferendumExecutor(
  providers: AppProviders,
  config: ReferendumConfig,
): ReferendumExecutor {
  const explorerBaseUrl = config.explorerBaseUrl ?? "https://explorer.preview.midnight.network/tx";
  let contract: any;
  const call = async (circuit: string, ...args: unknown[]) => {
    if (!contract) throw new Error("The referendum contract is not joined");
    return receiptFrom(await contract.callTx[circuit](...args), explorerBaseUrl);
  };

  return {
    async deploy(initialPrivateState) {
      contract = await deployContract(providers as any, {
        compiledContract: createCompiledReferendum(initialPrivateState),
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: initialPrivateState as any,
        args: [config.issuerSecret, config.organizerSecret, config.eventId],
      } as any);
      return contract;
    },
    async join(contractAddress, initialPrivateState) {
      contract = await findDeployedContract(providers as any, {
        contractAddress,
        compiledContract: createCompiledReferendum(initialPrivateState),
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: initialPrivateState as any,
      } as any);
      return contract;
    },
    issue: (commitment) => call("issue", commitment),
    castVote: () => call("castVote"),
    revealVote: (choice: VoteReveal["choice"], salt) => call("revealVote", choice, salt),
    closeVote: () => call("closeVote"),
    finalizeVote: () => call("finalizeVote"),
  };
}

/** Resolve a private voter witness path from the current canonical ledger state. */
export async function findEligibilityPath(
  providers: AppProviders,
  contractAddress: string,
  commitment: Uint8Array,
): Promise<PrivateState["voterPath"]> {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) throw new Error("The referendum contract has no canonical state yet");
  const ledger = (GeneratedReferendum as any).ledger(state.data);
  const path = ledger.eligibleVoters.findPathForLeaf(commitment);
  if (!path) throw new Error("This wallet is not present in the referendum eligibility tree");
  return path;
}

export function createStateObservable(
  publicDataProvider: AppProviders["publicDataProvider"],
  privateStateProvider: AppProviders["privateStateProvider"],
  contractAddress: string,
  parseLedger: (data: ChargedState) => ContractState,
): Observable<DerivedState> {
  const public$ = publicDataProvider
    .contractStateObservable(contractAddress, { type: "latest" })
    .pipe(map((state) => parseLedger(state.data)));
  const private$ = new Observable<PrivateState | null>((subscriber) => {
    privateStateProvider
      .get(PRIVATE_STATE_ID)
      .then((s) => subscriber.next(s))
      .catch((err) => subscriber.error(err));
  });
  return combineLatest([public$, private$]).pipe(
    map(([contractState, currentPrivateState]) => ({
      contractState,
      privateState: currentPrivateState,
    })),
    retry({ delay: 500 }),
  );
}
