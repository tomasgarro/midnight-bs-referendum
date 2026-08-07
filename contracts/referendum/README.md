# Referendum contract — first slice

This directory contains the first Compact contract slice for the Buenos Aires
hackathon referendum.

## Current guarantees

- Only the issuer role can add eligibility commitments.
- Eligibility is represented by a `HistoricMerkleTree<10, Bytes<32>>`, which
  supports up to 1,024 commitments and keeps past roots valid as the registry
  grows.
- `castVote` checks the private voter secret against a Merkle membership path.
- The event-scoped nullifier is inserted into `spentNullifiers`, so reusing the
  same secret and event is rejected.
- Only the organizer role can close the referendum.

## Deliberate scope boundary

The original brief's scalar `eligibleRoot: Bytes<32>` is not sufficient for a
growing registry. The tree is the source of truth and its root is obtained by
the TypeScript driver with `root()` when it builds `voterPath()`.

The `tally` map is currently a public-ledger scaffold so the circuit shape can
be compiled and exercised. Compact ledger state is public; `closed = false`
cannot hide it from an organizer or observer. The real hidden-tally milestone
needs encrypted ballot payloads plus a threshold/decryption or commit-reveal
protocol, and must be designed before the UI claims tally secrecy.

## Compile

From the repository root:

```bash
compact compile contracts/referendum/referendum.compact contracts/referendum/managed/referendum
```

Generated artifacts are ignored by Git. The next step is to add the simulator
test and the Camino A issuer adapter once the JavaScript dependencies are
installed. The simulator test source is already in `referendum.test.ts`.
