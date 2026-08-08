# Referendum contract — first slice

This directory contains the first Compact contract slice for the Buenos Aires
hackathon referendum.

## Current guarantees

- Only the issuer role can add eligibility commitments.
- Eligibility is represented by a `HistoricMerkleTree<10, Bytes<32>>`, which
  supports up to 1,024 commitments and keeps past roots valid as the registry
  grows.
- `castVote` privately commits YES, NO, or ABSTAIN after checking the private
  voter secret against a Merkle membership path.
- The event-scoped nullifier is inserted into `spentNullifiers`, so reusing the
  same secret and event is rejected.
- Only the organizer role can close and finalize the referendum.
- `revealVote` verifies historic ballot-commitment membership and updates the
  public aggregate only during the reveal phase.

## Deliberate scope boundary

The original brief's scalar `eligibleRoot: Bytes<32>` is not sufficient for a
growing registry. The tree is the source of truth and its root is obtained by
the TypeScript driver with `root()` when it builds `voterPath()`.

The contract uses commit/reveal: choices and salts are private during commit,
and only the aggregate YES/NO/ABSTAIN counters are updated during reveal.
The reveal phase is organizer-controlled and does not expose a live commit-
phase tally.

## Compile

From the repository root:

```powershell
$env:COMPACTC_BIN = "C:\\path\\to\\compactc.exe"
npm.cmd run compile
```

Generated artifacts are ignored by Git and synchronized into the API and UI by
`npm.cmd run build`. The simulator test source is in `referendum.test.ts`.
