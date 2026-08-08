# Development setup

This repository is the public code boundary. Keep Obsidian notes, recordings,
credentials, and other private material in the parent vault.

## The one checkout

The working copy lives at `~/src/referendum` inside WSL. There is no second
copy: work was previously split across a `/mnt/c` checkout and a separate clone
pointing at a different git remote, and edits were lost between them. Both old
directories now carry a `MOVED.md`.

Staying on ext4 rather than `/mnt/c` is not cosmetic — the UI test suite runs
in about 7 seconds here and took over 7 minutes on the Windows filesystem.

## Running it locally

Everything runs on `localhost`; there is no hosted deployment. Passport
passkeys and `getUserMedia` both accept `http://localhost`, so no HTTPS or
tunnel is needed.

Three processes:

```bash
docker start referendum-proof-server   # published on 127.0.0.1:6300
npm run relayer                        # sponsored fee payer, 127.0.0.1:8790
npm run dev -- --host localhost --port 4173 --strictPort
```

The proof server must be **published** to the host. A container started with
`--expose` alone is unreachable from both the browser and the relayer, and
every proof then fails with a connection error that reads like a wallet fault.
See [relayer/README.md](relayer/README.md) for the funding steps and the trust
boundary.

## Canonical environment: Linux/WSL2

All Node, npm, Compact, test, and build commands must run inside Linux or
WSL2. Windows is only the host OS and can provide the browser. This avoids
mixing Windows native modules with Linux dependencies and makes the Compact
compiler available to the same environment that builds the app.

Use Ubuntu on WSL2:

```bash
cd "/mnt/c/Users/tomas/Desktop/Midnight/BS AS Hackathon/12 Project"
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm install
nvm use
bash scripts/setup-linux.sh
```

If `nvm` is not available, install it from the [official nvm
repository](https://github.com/nvm-sh/nvm), reopen the WSL shell, and rerun the
commands. The project `.nvmrc` is the Node version source of truth.

For better filesystem performance, a Linux-native checkout such as
`~/src/midnight-referendum` is recommended. The existing `/mnt/c` checkout is
supported, but its `node_modules` must be installed by Linux npm, never by
PowerShell npm.

The setup script fails if `node` or `npm` resolves under `/mnt/c`. This is
intentional: WSL currently imports Windows PATH entries by default, and using
those binaries makes a project appear to run while still being a Windows
deployment.

## Compact compiler

Install the Linux Compact compiler using the current [Midnight developer
prerequisites](https://docs.midnight.network/). Verify the command before
compiling:

```bash
compactc --version
# The CLI fallback is also supported:
compact compile --version
```

The system `compact` command on Windows is an NTFS compression utility and is
not the Midnight compiler. Inside WSL, `compact` is the Midnight CLI. If the
Linux compiler is not on `PATH`:

```bash
COMPACTC_BIN=/path/to/compactc npm run validate:contract
```

The wrapper also accepts `COMPACT_BIN` for the legacy Compact CLI. Generated
contract artifacts are ignored by Git and are recreated by compilation and
`npm run sync:contract`.

## Preview configuration

Target network: Midnight Preview. Keep the [official compatibility
matrix](https://docs.midnight.network/relnotes/support-matrix) as the source of
truth for versions.

| Service | URL |
| --- | --- |
| Node RPC | `https://rpc.preview.midnight.network` |
| Indexer GraphQL | `https://indexer.preview.midnight.network/api/v4/graphql` |
| Local proof server fallback | `http://localhost:6300` |

The node and indexer are remote Preview services. Proof generation is local and
must use the matrix-compatible Proof Server version; it does not receive a
wallet seed or signing key.

Copy the browser environment template inside WSL:

```bash
cp ui/.env.example ui/.env
```

Use `VITE_APP_MODE=preview` only after setting a deployed contract address and
connecting a Preview-compatible DApp Connector wallet. The default mode is the
wallet-less, read-only demo. It never creates a simulated receipt; only a
canonical Preview confirmation is written to the local profile history.

## Run and test

Start the UI from WSL:

```bash
npm run dev -- --host localhost --port 4173 --strictPort
```

Open `http://localhost:4173`, not `http://127.0.0.1:4173`. Passport passkeys
require a valid HTTPS origin or the localhost relying-party domain. The browser
may run on Windows; the development server and all project processes run in
WSL.

Run the deterministic demo checks:

```bash
npm run verify:linux
```

Run the full Preview-oriented checks after installing `compactc`:

```bash
npm run verify:linux -- preview
```

The Preview verification path runs tests, Compact compilation, simulator
checks, contract asset synchronization, and the production build. It does not
claim that a deployed contract or real-wallet transaction has been confirmed.

## Current implementation boundary

The UI has a deterministic fixture eligibility provider. Rarimo and Blockenfy
remain research tracks until a real, tested Midnight attestation verifier is
available. No identity documents are accepted or stored.

Passport provides profile consent, display identity, and an app-scoped profile
ID. Anonymous voter secrets and nullifiers are independent. Contract approval
continues through the official DApp Connector until generic Passport contract
execution is formally supported.

The browser private-state provider encrypts state with WebCrypto and stores it
in IndexedDB. It falls back to memory only when IndexedDB or WebCrypto is not
available, such as some test or server-rendered environments.

## Before publishing

Run the Linux/WSL validation, inspect `git status`, and confirm that no private
vault material, credentials, `.env` files, or generated artifacts are tracked.
Use Apache License 2.0 for the public submission.
