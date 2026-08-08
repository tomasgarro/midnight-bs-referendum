import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Choice { YES = 0, NO = 1, ABSTAIN = 2 }

export enum Phase { COMMIT = 0, REVEAL = 1, FINALIZED = 2 }

export type Witnesses<PS> = {
  issuerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  organizerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  voterSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  voterPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                          path: { sibling: { field: bigint
                                                                                           },
                                                                                  goes_left: boolean
                                                                                }[]
                                                                        }];
  voterChoice(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Choice];
  voteSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  revealPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                           path: { sibling: { field: bigint
                                                                                            },
                                                                                   goes_left: boolean
                                                                                 }[]
                                                                         }];
}

export type ImpureCircuits<PS> = {
  issue(context: __compactRuntime.CircuitContext<PS>, commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealVote(context: __compactRuntime.CircuitContext<PS>,
             choice_0: Choice,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalizeVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  issue(context: __compactRuntime.CircuitContext<PS>, commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealVote(context: __compactRuntime.CircuitContext<PS>,
             choice_0: Choice,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalizeVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  issue(context: __compactRuntime.CircuitContext<PS>, commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealVote(context: __compactRuntime.CircuitContext<PS>,
             choice_0: Choice,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalizeVote(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly issuerKey: Uint8Array;
  readonly organizerKey: Uint8Array;
  readonly eventId: Uint8Array;
  eligibleVoters: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  ballotCommitments: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  spentNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  revealedCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  tally: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Choice): boolean;
    lookup(key_0: Choice): bigint;
    [Symbol.iterator](): Iterator<[Choice, bigint]>
  };
  readonly phase: Phase;
  readonly closed: boolean;
  readonly issuedVoters: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               initialIssuerSecret_0: Uint8Array,
               initialOrganizerSecret_0: Uint8Array,
               referendumEventId_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
