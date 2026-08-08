import { describe, expect, it } from "vitest";
import {
  CompactTypeBytes,
  CompactTypeEnum,
  CompactTypeVector,
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  persistentCommit,
  persistentHash,
  type MerkleTreePath,
  type WitnessContext,
} from "@midnight-ntwrk/compact-runtime";
import { sampleCoinPublicKey } from "@midnight-ntwrk/ledger-v8";
import { Choice, Contract, ledger as referendumLedger } from "./managed/referendum/contract/index.js";

type PrivateState = {
  issuerSecret: Uint8Array;
  organizerSecret: Uint8Array;
  voterSecret: Uint8Array;
  voterChoice: Choice;
  voteSalt: Uint8Array;
  voterPath?: MerkleTreePath<Uint8Array>;
  revealPath?: MerkleTreePath<Uint8Array>;
};

const bytes32 = new CompactTypeBytes(32);
const hash2 = new CompactTypeVector(2, bytes32);
const choiceType = new CompactTypeEnum(2, 1);

function pad32(value: string): Uint8Array {
  const result = new Uint8Array(32);
  result.set(new TextEncoder().encode(value));
  return result;
}

function eligibilityCommitment(secret: Uint8Array): Uint8Array {
  return persistentHash(hash2, [pad32("referendum:commitment:"), secret]);
}

function ballotCommitment(choice: Choice, salt: Uint8Array): Uint8Array {
  return persistentCommit(choiceType, choice, salt);
}

function newBytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

function witnesses() {
  return {
    issuerSecret: (context: WitnessContext<unknown, PrivateState>) => [context.privateState, context.privateState.issuerSecret],
    organizerSecret: (context: WitnessContext<unknown, PrivateState>) => [context.privateState, context.privateState.organizerSecret],
    voterSecret: (context: WitnessContext<unknown, PrivateState>) => [context.privateState, context.privateState.voterSecret],
    voterChoice: (context: WitnessContext<unknown, PrivateState>) => [context.privateState, context.privateState.voterChoice],
    voteSalt: (context: WitnessContext<unknown, PrivateState>) => [context.privateState, context.privateState.voteSalt],
    voterPath: (context: WitnessContext<unknown, PrivateState>) => {
      if (!context.privateState.voterPath) throw new Error("voterPath was requested before eligibility was issued");
      return [context.privateState, context.privateState.voterPath];
    },
    revealPath: (context: WitnessContext<unknown, PrivateState>) => {
      if (!context.privateState.revealPath) throw new Error("revealPath was requested before commit");
      return [context.privateState, context.privateState.revealPath];
    },
  };
}

function setup() {
  const privateState: PrivateState = {
    issuerSecret: newBytes(1),
    organizerSecret: newBytes(2),
    voterSecret: newBytes(3),
    voterChoice: Choice.YES,
    voteSalt: newBytes(4),
  };
  const contract = new Contract(witnesses());
  const constructorContext = createConstructorContext(privateState, sampleCoinPublicKey());
  const initial = contract.initialState(constructorContext, privateState.issuerSecret, privateState.organizerSecret, newBytes(9));
  const context = createCircuitContext(dummyContractAddress(), initial.currentZswapLocalState, initial.currentContractState, initial.currentPrivateState);
  return { contract, context, privateState };
}

function issueVoter(contract: Contract<any>, context: any, privateState: PrivateState) {
  const commitment = eligibilityCommitment(privateState.voterSecret);
  const issued = contract.impureCircuits.issue(context, commitment);
  const state = referendumLedger(issued.context.currentQueryContext.state);
  privateState.voterPath = state.eligibleVoters.findPathForLeaf(commitment);
  return issued;
}

describe("referendum contract simulator", () => {
  it("commits privately and rejects a second vote with the same nullifier", () => {
    const { contract, context, privateState } = setup();
    const issued = issueVoter(contract, context, privateState);
    const firstVote = contract.impureCircuits.castVote(issued.context);
    const stateAfterCommit = referendumLedger(firstVote.context.currentQueryContext.state);
    expect(stateAfterCommit.spentNullifiers.size()).toBe(1n);
    expect(stateAfterCommit.tally.lookup(Choice.YES)).toBe(0n);
    expect(() => contract.impureCircuits.castVote(firstVote.context)).toThrow("already voted");
  });

  it("reveals one commitment into the correct aggregate and rejects replay", () => {
    const { contract, context, privateState } = setup();
    const issued = issueVoter(contract, context, privateState);
    const committed = contract.impureCircuits.castVote(issued.context);
    const committedState = referendumLedger(committed.context.currentQueryContext.state);
    const commitment = ballotCommitment(Choice.YES, privateState.voteSalt);
    privateState.revealPath = committedState.ballotCommitments.findPathForLeaf(commitment);
    expect(privateState.revealPath).toBeDefined();
    const closed = contract.impureCircuits.closeVote(committed.context);
    const revealed = contract.impureCircuits.revealVote(closed.context, Choice.YES, privateState.voteSalt);
    const state = referendumLedger(revealed.context.currentQueryContext.state);
    expect(state.phase).toBe(1);
    expect(state.tally.lookup(Choice.YES)).toBe(1n);
    expect(state.tally.lookup(Choice.NO)).toBe(0n);
    expect(state.tally.lookup(Choice.ABSTAIN)).toBe(0n);
    expect(() => contract.impureCircuits.revealVote(revealed.context, Choice.YES, privateState.voteSalt)).toThrow("already been revealed");
  });

  it("rejects invalid reveals and protects organizer-only finalization", () => {
    const { contract, context, privateState } = setup();
    const issued = issueVoter(contract, context, privateState);
    const committed = contract.impureCircuits.castVote(issued.context);
    const closed = contract.impureCircuits.closeVote(committed.context);
    privateState.revealPath = {
      leaf: newBytes(77),
      path: referendumLedger(committed.context.currentQueryContext.state).ballotCommitments.pathForLeaf(0n, newBytes(77)).path,
    };
    expect(() => contract.impureCircuits.revealVote(closed.context, Choice.NO, newBytes(88))).toThrow();
    const attackerContext = createCircuitContext(dummyContractAddress(), closed.context.currentZswapLocalState, closed.context.currentQueryContext.state, { ...privateState, organizerSecret: newBytes(88) });
    expect(() => contract.impureCircuits.finalizeVote(attackerContext)).toThrow("Only the organizer");
    const finalized = contract.impureCircuits.finalizeVote(closed.context);
    expect(referendumLedger(finalized.context.currentQueryContext.state).phase).toBe(2);
  });
});
