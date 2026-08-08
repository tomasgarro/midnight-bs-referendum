import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";

/**
 * Replace these placeholder types with your contract's actual types.
 *
 * ContractState â€” the shape of your contract's public ledger state,
 *   parsed from the indexer via YourContract.ledger(state.data).
 *
 * PrivateState â€” the shape of your off-chain state stored locally,
 *   typically containing secret keys or user-specific data.
 *
 * DerivedState â€” the combined view your UI components consume,
 *   computed from ContractState + PrivateState.
 */

export type ImpureCircuitKeys =
  | "issue"
  | "castVote"
  | "closeVote"
  | "revealVote"
  | "finalizeVote";

// TODO: Replace with your contract's private state identifier
export const PRIVATE_STATE_ID = "referendumPrivateState" as const;

// TODO: Replace with your contract's public ledger state shape
export interface ContractState {
  phase: "COMMIT" | "REVEAL" | "FINALIZED";
  closed: boolean;
  issuedVoters: bigint;
  tally: ReadonlyMap<"YES" | "NO" | "ABSTAIN", bigint>;
}

// TODO: Replace with your contract's private state shape
export interface PrivateState {
  issuerSecret?: Uint8Array;
  organizerSecret?: Uint8Array;
  voterSecret?: Uint8Array;
  voterChoice?: "YES" | "NO" | "ABSTAIN";
  voteSalt?: Uint8Array;
  voterPath?: {
    leaf: Uint8Array;
    path: { sibling: { field: bigint }; goes_left: boolean }[];
  };
  revealPath?: {
    leaf: Uint8Array;
    path: { sibling: { field: bigint }; goes_left: boolean }[];
  };
}

export interface PassportSession {
  requestId: string;
  nonce: string;
  origin: string;
  displayName?: string;
  passportContract?: { address: string; network: string };
  midnightAddresses?: {
    unshielded: string;
    shielded?: string;
    dust?: string;
  };
}

export interface EligibilityAttestation {
  provider: "fixture" | "rarimo" | "blockenfy" | "external";
  eventId: string;
  subjectCommitment: Uint8Array;
  issuedAt: string;
  expiresAt?: string;
  claims: Readonly<Record<string, string | boolean>>;
}

export interface VoteCommitment {
  eventId: string;
  commitment: Uint8Array;
  createdAt: string;
}

export interface VoteReveal {
  eventId: string;
  choice: "YES" | "NO" | "ABSTAIN";
  salt: Uint8Array;
  commitment: Uint8Array;
}

export interface TransactionReceipt {
  txId: string;
  txHash: string;
  blockHeight: number;
  blockHash: string;
  blockTimestamp: number;
  status: string;
  explorerUrl: string;
}

export interface ReferendumExecutor {
  deploy(initialPrivateState: PrivateState): Promise<unknown>;
  join(contractAddress: string, initialPrivateState: PrivateState): Promise<unknown>;
  issue(commitment: Uint8Array): Promise<TransactionReceipt>;
  castVote(): Promise<TransactionReceipt>;
  revealVote(choice: VoteReveal["choice"], salt: Uint8Array): Promise<TransactionReceipt>;
  closeVote(): Promise<TransactionReceipt>;
  finalizeVote(): Promise<TransactionReceipt>;
}

// Combined state for UI consumption
export interface DerivedState {
  contractState: ContractState | null;
  privateState: PrivateState | null;
}

export type AppProviders = MidnightProviders<
  ImpureCircuitKeys,
  typeof PRIVATE_STATE_ID,
  PrivateState
>;
