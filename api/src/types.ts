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

export type ImpureCircuitKeys = "issue" | "castVote" | "closeVote";

// TODO: Replace with your contract's private state identifier
export const PRIVATE_STATE_ID = "referendumPrivateState" as const;

// TODO: Replace with your contract's public ledger state shape
export interface ContractState {
  closed: boolean;
  issuedVoters: bigint;
  tally: ReadonlyMap<number, bigint>;
}

// TODO: Replace with your contract's private state shape
export interface PrivateState {
  voterSecret?: Uint8Array;
  voterPath?: {
    leaf: Uint8Array;
    path: { sibling: { field: bigint }; goes_left: boolean }[];
  };
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
