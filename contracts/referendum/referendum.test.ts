import { describe, expect, it } from 'vitest';
import {
  CompactTypeBytes,
  CompactTypeVector,
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  persistentHash,
  type MerkleTreePath,
  type WitnessContext,
} from '@midnight-ntwrk/compact-runtime';
import { sampleCoinPublicKey } from '@midnight-ntwrk/ledger-v8';
import {
  Choice,
  Contract,
  ledger as referendumLedger,
} from './managed/referendum/contract/index.js';

type PrivateState = {
  issuer: Uint8Array;
  organizer: Uint8Array;
  voter: Uint8Array;
  path?: MerkleTreePath<Uint8Array>;
};

const bytes32 = new CompactTypeBytes(32);
const hash2 = new CompactTypeVector(2, bytes32);

function pad32(value: string): Uint8Array {
  const result = new Uint8Array(32);
  result.set(new TextEncoder().encode(value));
  return result;
}

function commitmentFor(secret: Uint8Array): Uint8Array {
  return persistentHash(hash2, [pad32('referendum:commitment:'), secret]);
}

function newBytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

function witnesses() {
  return {
    issuerSecret: (context: WitnessContext<unknown, PrivateState>) => [
      context.privateState,
      context.privateState.issuer,
    ],
    organizerSecret: (context: WitnessContext<unknown, PrivateState>) => [
      context.privateState,
      context.privateState.organizer,
    ],
    voterSecret: (context: WitnessContext<unknown, PrivateState>) => [
      context.privateState,
      context.privateState.voter,
    ],
    voterPath: (context: WitnessContext<unknown, PrivateState>) => {
      if (!context.privateState.path) {
        throw new Error('voterPath was requested before eligibility was issued');
      }
      return [context.privateState, context.privateState.path];
    },
  };
}

function setup() {
  const privateState: PrivateState = {
    issuer: newBytes(1),
    organizer: newBytes(2),
    voter: newBytes(3),
  };
  const contract = new Contract(witnesses());
  const constructorContext = createConstructorContext(
    privateState,
    sampleCoinPublicKey(),
  );
  const initial = contract.initialState(
    constructorContext,
    privateState.issuer,
    privateState.organizer,
    newBytes(9),
  );
  const context = createCircuitContext(
    dummyContractAddress(),
    initial.currentZswapLocalState,
    initial.currentContractState,
    initial.currentPrivateState,
  );
  return { contract, context, privateState };
}

describe('referendum contract simulator', () => {
  it('rejects a second vote with the same event-scoped nullifier', () => {
    const { contract, context, privateState } = setup();
    const commitment = commitmentFor(privateState.voter);

    const issued = contract.impureCircuits.issue(context, commitment);
    const stateAfterIssue = referendumLedger(
      issued.context.currentQueryContext.state,
    );
    const path = stateAfterIssue.eligibleVoters.findPathForLeaf(commitment);
    expect(path).toBeDefined();
    issued.context.currentPrivateState.path = path;

    const firstVote = contract.impureCircuits.castVote(
      issued.context,
      Choice.YES,
    );
    const stateAfterFirstVote = referendumLedger(
      firstVote.context.currentQueryContext.state,
    );

    expect(stateAfterFirstVote.spentNullifiers.size()).toBe(1n);
    expect(stateAfterFirstVote.tally.lookup(Choice.YES)).toBe(1n);

    expect(() =>
      contract.impureCircuits.castVote(firstVote.context, Choice.YES),
    ).toThrow('This voter has already voted in this referendum');
  });

  it('rejects an issuer witness that does not match the deployment role', () => {
    const { contract, context, privateState } = setup();
    const attackerState: PrivateState = {
      ...privateState,
      issuer: newBytes(99),
    };
    context.currentPrivateState = attackerState;

    expect(() =>
      contract.impureCircuits.issue(context, commitmentFor(privateState.voter)),
    ).toThrow('Only the eligibility issuer can issue commitments');
  });

  it('allows only the organizer to close the referendum', () => {
    const { contract, context, privateState } = setup();
    const attackerContext = createCircuitContext(
      dummyContractAddress(),
      context.currentZswapLocalState,
      context.currentQueryContext.state,
      { ...privateState, organizer: newBytes(88) },
    );

    expect(() => contract.impureCircuits.closeVote(attackerContext)).toThrow(
      'Only the organizer can close the referendum',
    );

    const closed = contract.impureCircuits.closeVote(context);
    expect(
      referendumLedger(closed.context.currentQueryContext.state).closed,
    ).toBe(true);
  });
});
