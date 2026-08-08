# Hack Buenos Aires — Referéndum Cívico

This repository contains a privacy-first civic referendum prototype built on
the Midnight Network. It is an independent hackathon project, not an official
government referendum.

The application uses Midnight Passport for user-facing onboarding and profile
consent, while the anonymous voter secret remains separate from Passport and
wallet identity. Contract approval currently happens through the official
Midnight DApp Connector.

## What is implemented

- Compact referendum contract with private YES/NO/ABSTAIN commit inputs.
- Proposal-scoped nullifiers and Merkle eligibility membership to prevent
  duplicate voting without exposing the voter identity.
- Separate COMMIT, REVEAL, and FINALIZED phases with aggregate tally updates
  only during reveal.
- Generated contract driver and typed Midnight.js executor for deploy, join,
  commit, reveal, close, and finalize operations.
- Browser provider assembly using wallet configuration, FetchZkConfigProvider,
  delegated wallet proving, DUST balancing, transaction submission, and
  canonical indexer confirmation.
- Strict Passport profile bridge with origin, source-window, request-ID,
  nonce, and timeout validation.
- Deterministic local eligibility fixture. Rarimo and Blockenfy adapters remain
  disabled until a real, tested Midnight attestation verifier exists.
- Wallet-less demo flow with local receipts, verification, Passport profile
  status, and a four-tab `Mi perfil` space.
- npm workspace scripts, Windows-friendly Vite configuration, and contract
  asset synchronization.

## What remains unverified or incomplete

- A deployed Preview contract address and a full real-wallet E2E transaction.
- Production Passport onboarding from an HTTPS deployment. Local passkeys must
  be tested from `http://localhost`, not `127.0.0.1`.
- Organizer-facing reveal, close, and finalize screens. The API executor and
  Compact circuits exist, but the citizen UI currently submits the commit.
- A production eligibility issuer and verifier. No identity documents are
  accepted or stored by this prototype.
- In-app `.night` claiming. `Mi perfil` links to Midnight Domains; claiming
  will be added only after wallet approval, DUST/payment, and write-operation
  behavior are verified.

## Preview services

- Node RPC: `https://rpc.preview.midnight.network`
- Indexer GraphQL: `https://indexer.preview.midnight.network/api/v4/graphql`
- Local proof server fallback: `http://localhost:6300`

Provider endpoints are taken from the connected wallet configuration. The
proof-server path is explicit and is not inferred from the node port.

## Run the demo locally

From the repository root on Windows:

```powershell
npm.cmd install --workspaces
Copy-Item ui/.env.example ui/.env
npm.cmd run dev -- --host localhost --port 4173 --strictPort
```

Open [http://localhost:4173](http://localhost:4173). The default local
prototype does not require a wallet or Passport. It lets you explore the
proposal, commit/reveal explanation, simulated receipt, verification page, and
profile history.

The dev config keeps Vite dependency discovery disabled for the npm-hoisted
workspace and transforms React/Phosphor CommonJS modules explicitly. This keeps
the local server reliable on Windows while the production build uses the full
React Vite pipeline.

The Passport passkey relying party must be `localhost` or HTTPS. If the app is
opened at `http://127.0.0.1:4173`, the UI stops before opening Passport and
explains how to switch to `http://localhost:4173`.

## Enable Preview mode

Copy `.env.example` to `.env`, then configure:

```dotenv
VITE_APP_MODE=preview
VITE_MIDNIGHT_CONTRACT_ADDRESS=your_deployed_contract_address
```

Compile and synchronize the generated contract assets before building:

```powershell
npm.cmd run compile
npm.cmd run sync:contract
npm.cmd run build
```

On Windows, set `COMPACTC_BIN` to the installed Compact compiler path when
`npm.cmd run compile` cannot find it. The generated ZK keys and ZKIR files are
ignored and recreated by the sync step; do not commit local credentials or
`.env` files.

Preview voting requires a compatible DApp Connector wallet connected to the
Preview network, a deployed contract, served ZK assets, and sufficient DUST.
Passport supplies profile consent and display identity; it does not replace
the wallet approval flow.

## Validation

```powershell
npm.cmd test
npm.cmd run build
```

`npm.cmd test` runs the Compact simulator tests and the UI/provider/Passport
tests. `npm.cmd run build` also synchronizes the generated contract runtime and
browser assets.

The project keeps both `package-lock.json` for the npm workflow and the
synchronized `yarn.lock` required by Midnight starter parity. The intended
developer workflow is npm.

## Related documentation

- [Development workflow](DEVELOPMENT.md)
- [Referendum contract notes](contracts/referendum/README.md)
- [Midnight Domains SDK](https://docs.midnight.domains/reference/)
- [Midnight Passport](https://github.com/midnightntwrk/passport)

## License

Apache License 2.0. See [LICENSE](LICENSE).
