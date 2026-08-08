# Sponsored relayer

Pays the network fee for referendum votes so a citizen needs no wallet, no
browser extension, and no DUST.

## Why this exists

Midnight Passport's third-party bridge exposes two protocols: a profile bridge
and a transaction bridge whose only intent kind is `unshielded-transfer`. It
cannot sign a Compact contract call, so Passport alone cannot cast a vote.

The referendum contract authorises `castVote` on **anonymous Merkle membership
plus a proposal-scoped nullifier** — never on who submitted the transaction
(`contracts/referendum/referendum.compact`). So a third party can pay for and
submit a vote it did not author. That is what this service does.

## Trust boundary

What the relayer **can** see: the proven transaction (which carries the
nullifier and the ballot commitment) and the caller's IP address.

What it **cannot** see: the ballot choice, which stays sealed until the reveal
phase, and which eligibility leaf was used, because membership is proved in
zero knowledge.

What it **can** do: refuse to submit. That is a liveness risk, not a privacy
one, and it is visible — the vote simply fails.

Separately, and importantly: **the proof server sees the witness**, meaning the
voter secret and the choice. That is why `VITE_MIDNIGHT_PROOF_SERVER_URL`
should point at a proof server on the voter's own machine. Pointing it at
someone else's host hands them the ballot in plaintext.

## Setup

```bash
cp relayer/.env.example relayer/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put that value in `RELAYER_SEED`. It never leaves your machine — `.env` is
gitignored, and the server never logs it or returns it from an endpoint.

Find the address to fund:

```bash
npm run relayer:address
```

Send Preview NIGHT to the printed unshielded address and register it for DUST
generation from a wallet you control. Without DUST the relayer can pay for
nothing and every vote fails at the fee step.

Then run it:

```bash
npm run relayer
```

## Endpoints

All bound to `127.0.0.1` by default, CORS-restricted to
`RELAYER_ALLOWED_ORIGINS` (never `*`).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Sync state, public addresses, balances |
| `GET` | `/keys` | Shielded coin and encryption public keys |
| `POST` | `/balance` | `{ tx }` proven hex → balanced+finalized hex |
| `POST` | `/submit` | `{ tx }` hex → `{ txId }` |

`/balance` and `/submit` map onto the `WalletProvider.balanceTx` and
`MidnightProvider.submitTx` interfaces that Midnight.js already expects, which
is why the browser needs no special-casing beyond choosing a provider set.

Requests are serialised through a queue: two concurrent balances would try to
spend the same coins.

## Operational notes

- Exposing this beyond loopback without authentication lets anyone drain the
  relayer's DUST. Add auth and rate limiting first.
- The wallet resyncs from the indexer on every start; expect a delay before
  the first request succeeds.
- The issuer and organizer keys used by `scripts/deploy-referendum.mjs` are
  derived from this same seed with domain separation, so keeping the seed
  means keeping the ability to run close, reveal and finalize.
