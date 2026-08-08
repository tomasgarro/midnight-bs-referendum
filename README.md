# Hack Buenos Aires — Anonymous Civic Referendum

Hack Buenos Aires is a privacy-first civic participation prototype built on
the Midnight Network. It explores how citizens can participate in a public
referendum while proving eligibility and one-person-one-vote without exposing
their identity or ballot choice.

This is an independent hackathon project, not an official government
referendum. The current release is a jury-facing v0: the complete local UX/UI,
privacy model, contract implementation, and Linux/WSL development workflow are
available; real Preview wallet execution and production identity issuance
remain explicit next steps.

## The problem

Digital civic consultations usually force a difficult compromise:

- Centralized systems can link a person to a vote and create a high-value
  identity database.
- Public ledgers can make participation auditable, but naïve ballots expose
  choices or wallet identities.
- Traditional blockchain onboarding introduces seed phrases, extensions,
  unfamiliar addresses, and transaction-fee friction.
- Citizens and organizers need both privacy and credible guarantees that only
  eligible people vote once.

## The solution

The referendum separates the user-facing identity from the anonymous ballot:

1. Midnight Passport handles passkey onboarding, profile consent, and the
   display identity.
2. A separate private voter secret is used for anonymous eligibility and
   proposal-scoped nullifiers; it is never derived from the Passport profile or
   wallet identity.
3. A Compact commit/reveal contract privately commits YES, NO, or ABSTAIN,
   checks anonymous Merkle membership, blocks duplicate votes, and publishes
   aggregates only during reveal.
4. The official Midnight DApp Connector remains the approval boundary for
   wallet proving, balancing, and contract submission until Passport supports
   generic contract execution.

This gives the prototype a clear privacy boundary: Passport can make the
experience understandable and accountable to the user without becoming the
ballot identity.

## What the v0 demonstrates

### Citizen experience

- Wallet-less demo mode for exploring the complete UX/UI without credentials.
- Spanish civic referendum flow with proposal detail, voting explanation,
  verification, and profile space.
- Compact four-step mental model: understand, vote, verify, and review profile.
- Explicit separation between “Passport identity connected” and “wallet
  approval required”.
- Local participation receipts with proposal, timestamp, status, and explorer
  link; vote choice is not stored in Passport-backed history.
- .night / Midnight Domains profile shell with an external claim CTA.

### Privacy and protocol

- Private YES/NO/ABSTAIN commit input.
- Commit, reveal, and finalized phases.
- Historic Merkle eligibility membership supporting a growing registry.
- Proposal-scoped nullifiers preventing duplicate voting without exposing the
  voter secret.
- Anonymous reveal that updates only aggregate YES/NO/ABSTAIN counters.
- Organizer-only close and finalize authorization.
- Deterministic local eligibility fixture for the hackathon path.
- No raw identity documents, voter secrets, salts, or nullifiers in
  localStorage, backend state, or Compact public state.

### Midnight integrations

- Strict Passport profile bridge using exact-origin postMessage validation,
  source-window checks, request IDs, nonces, and timeouts.
- Midnight.js provider assembly with wallet configuration as the endpoint source
  of truth.
- FetchZkConfigProvider for served contract assets.
- Wallet-delegated proving by default, with an explicit local proof-server
  fallback.
- DUST-aware balance/readiness checks and transaction lifecycle types.
- Canonical indexer confirmation before explorer receipt links.
- Rarimo and Blockenfy deliberately disabled until a real, tested Midnight
  attestation verifier is available.

## Technology and tools

| Area | Tools |
| --- | --- |
| Smart contract | Compact, Compact CLI/compiler, generated contract driver |
| Midnight runtime | Midnight.js, Compact Runtime, Ledger v8, DApp Connector API |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Identity | Midnight Passport passkey/profile bridge |
| Private state | WebCrypto AES-GCM and IndexedDB |
| Testing | Vitest, Compact simulator, API/provider/Passport/UI tests |
| Network target | Midnight Preview RPC, indexer, and wallet ecosystem |
| Development OS | Linux/WSL2; Windows is only the host/browser when desired |

## Prerequisites

Run the toolchain inside Linux or WSL2. Do not use PowerShell npm for this
project: mixing Windows node_modules with Linux dependencies breaks native
bindings and can make the Compact workflow appear to work when it does not.

Required for the local demo and contract workflow:

- Ubuntu or another Linux distribution under WSL2, preferably x86_64.
- Git.
- curl, a POSIX shell, and build tools available in the WSL distribution.
- [nvm](https://github.com/nvm-sh/nvm).
- Node.js 22.22.0, selected by the repository .nvmrc.
- npm 10.x, supplied by the pinned Node release.
- Midnight Compact CLI 0.5.1 and compiler 0.31.1.
- A modern browser for WebCrypto, IndexedDB, and the local demo.

Required only for Preview wallet execution:

- A compatible Midnight DApp Connector wallet, such as Lace, connected to
  Preview.
- A deployed referendum contract address.
- Served generated contract/ZK assets.
- Wallet-delegated proving, or the matching local Midnight Proof Server when
  using the explicit fallback.
- tDUST/DUST availability according to the current Preview setup.

Passport passkeys work from http://localhost, or from an HTTPS deployment.
Do not use http://127.0.0.1 for Passport onboarding.

## Fresh Linux/WSL setup

Clone the repository into the Linux filesystem for better performance:

~~~bash
git clone https://github.com/tomasgarro/midnight-bs-referendum.git ~/src/midnight-referendum
cd ~/src/midnight-referendum
~~~

Load the project Node version and Compact tools:

~~~bash
source ~/.nvm/nvm.sh
nvm install
nvm use
export PATH="$HOME/.local/bin:$HOME/.compact/bin:$PATH"

node --version
npm --version
compact --version
compact compile --version
~~~

The official Compact installer may expose a compactc wrapper that does not
resolve correctly through its version symlink. This project automatically uses
compact compile when that happens; do not use Windows compact.exe, which is an
unrelated NTFS command.

Install workspaces, create the local environment file, compile the contract,
build the API declarations, and run checks:

~~~bash
bash scripts/setup-linux.sh
~~~

The setup script uses npm install --workspaces --include-workspace-root,
recreates ignored Compact artifacts, and runs the deterministic checks when a
working Compact compiler is available. The generated ZK keys, ZKIR files,
dist, and local .env are not committed.

For the complete Preview-oriented validation path:

~~~bash
npm run verify:linux -- preview
~~~

This runs contract compilation, simulator tests, API/UI/provider/Passport
tests, asset synchronization, and the production build. It does not claim that
a real Preview wallet transaction has been submitted.

## Start the UX/UI flow

The default mode is wallet-less demo mode:

~~~bash
npm run dev -- --host localhost --port 4173 --strictPort
~~~

Open [http://localhost:4173](http://localhost:4173). The browser can run on
Windows while the server, compiler, tests, and build remain in WSL.

The demo does not require Passport, Lace, a contract address, a proof server,
or Preview funds. It provides the local proposal, commit/reveal explanation,
simulated receipt, verification page, and profile history.

## Enable Preview mode

Create or edit ui/.env from the template:

~~~bash
cp ui/.env.example ui/.env
~~~

Configure at least:

~~~dotenv
VITE_APP_MODE=preview
VITE_MIDNIGHT_CONTRACT_ADDRESS=your_deployed_contract_address
~~~

For the explicit local proof-server fallback only:

~~~dotenv
VITE_MIDNIGHT_PROOF_SERVER_URL=http://localhost:6300
~~~

Then compile, synchronize, and build:

~~~bash
npm run compile
npm run build
~~~

Preview service endpoints are:

- Node RPC: https://rpc.preview.midnight.network
- Indexer GraphQL: https://indexer.preview.midnight.network/api/v4/graphql
- Local proof-server fallback: http://localhost:6300

Provider endpoints come from the connected wallet configuration. The proof
server is explicit and is never inferred from a substrate node port.

## Roadmap and handoff status

This section is intentionally explicit so a new engineer or AI coding agent
can continue from the GitHub repository without confusing local readiness with
Preview production readiness.

### Finalized and tested in the current v0

- [x] Compact commit/reveal contract with YES, NO, and ABSTAIN.
- [x] Separate COMMIT, REVEAL, and FINALIZED phases.
- [x] Historic Merkle eligibility membership.
- [x] Proposal-scoped nullifiers and duplicate-vote protection.
- [x] Anonymous reveal with aggregate-only result updates.
- [x] Organizer close/finalize authorization in the contract layer.
- [x] Generated contract driver and typed Midnight.js executor wiring.
- [x] Passport origin/source/request-ID/nonce/timeout validation.
- [x] Passport profile identity kept separate from the anonymous voter secret.
- [x] Encrypted IndexedDB private state with in-memory fallback for tests.
- [x] Deterministic fixture eligibility provider.
- [x] DApp Connector provider assembly and explicit Preview readiness matrix.
- [x] DUST balance/readiness display and canonical receipt/indexer types.
- [x] Four-tab citizen UI with Mi perfil and Midnight Domains shell.
- [x] Demo mode without wallet, Passport, contract, or proof server.
- [x] Linux/WSL setup scripts and cross-platform optional dependency lockfile.
- [x] Native WSL validation: contract tests 3/3, API tests 1/1, UI tests
  15/15, compilation, and production build passed.

### Still missing or unverified

- [ ] A deployed referendum contract address on Midnight Preview.
- [ ] Full real-wallet E2E: Passport onboarding, DApp Connector approval, DUST
  balancing, proving, submission, and canonical indexer confirmation.
- [ ] Organizer-facing reveal, close, and finalize UI.
- [ ] Citizen-facing reveal timing and finalized result presentation.
- [ ] Production eligibility issuer and a tested Midnight attestation verifier.
  Rarimo and Blockenfy must remain disabled until then.
- [ ] Production Passport onboarding from an HTTPS deployment and exact
  Passport contract-identity behavior.
- [ ] Read-only .night resolution through @midnames/sdk.
- [ ] In-app .night claiming after wallet approval, DUST/payment, and write
  operation behavior are verified.
- [ ] Production monitoring, analytics, error reporting, and accessibility
  audit with real civic users.
- [ ] Security review of the deployed contract, proof flow, eligibility issuer,
  and browser private-state recovery model.

### Recommended next sequence

1. Deploy the current generated contract to Preview and record its address in a
   private local ui/.env.
2. Run the complete real-wallet flow with Lace and capture transaction IDs,
   DUST behavior, explorer links, and indexer confirmation.
3. Add organizer reveal/close/finalize screens and test the phase transitions
   against the deployed contract.
4. Choose and implement one real eligibility attestation adapter with a
   verifier test before connecting any external issuer.
5. Implement read-only Midnight Domains lookup, then evaluate claiming as a
   separate wallet/payment feature.
6. Perform a privacy/security review before presenting the app as a production
   civic system.

## Contribution boundary

Do not commit .env, credentials, wallet seeds, raw identity documents,
generated ZK keys, ZKIR files, or private vault/Obsidian material. Keep
generated artifacts reproducible through npm run compile and
npm run sync:contract.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the operational setup and
[contracts/referendum/README.md](contracts/referendum/README.md) for contract
guarantees and compilation notes.

## License

Apache License 2.0. See [LICENSE](LICENSE).
