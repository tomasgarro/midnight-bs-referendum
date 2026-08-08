# Development setup

This repository is the public code boundary. Keep Obsidian notes, recordings,
credentials, and other private material in the parent vault, not here.

## Target environment: Preview

All deployed and wallet-backed development for this project targets Midnight
Preview. Keep the [official compatibility matrix](https://docs.midnight.network/relnotes/support-matrix)
as the source of truth for package and service versions.

Preview endpoints:

| Service | URL |
| --- | --- |
| Node RPC | `https://rpc.preview.midnight.network` |
| Indexer GraphQL | `https://indexer.preview.midnight.network/api/v4/graphql` |
| Proof server | `http://localhost:6300` |

The node and indexer are remote Preview services. Proof generation is local and
must use the matrix-compatible Proof Server version; it does not receive a
wallet seed or signing key. Lace and the Preview faucet are already configured
outside this repository and are not part of the setup checklist.

The latest tested Preview versions are:

| Component | Version |
| --- | ---: |
| Midnight node | 1.0.1 |
| Compact devtools | 0.5.1 |
| Compact compiler | 0.31.1 |
| Compact runtime | 0.16.0 |
| Compact JS | 2.5.1 |
| Platform JS | 2.2.4 |
| On-chain runtime | 3.0.0 |
| Wallet SDK | 1.2.0 |
| Midnight.js | 4.1.1 |
| testkit-js | 4.1.1 |
| DApp Connector API | 4.0.1 |
| Midnight Indexer | 4.3.5 |
| Proof Server | 8.1.0 |

## Open the project

Use Ubuntu on WSL2 for the toolchain:

```bash
cd "/mnt/c/Users/tomas/Desktop/Midnight/BS AS Hackathon/12 Project"
nvm use
claude
```

To open the same folder in VS Code with the WSL remote:

```bash
code --remote wsl+Ubuntu \
  "/mnt/c/Users/tomas/Desktop/Midnight/BS AS Hackathon/12 Project"
```

The Windows-side Claude launch configuration is kept at
`C:\Users\tomas\Desktop\Midnight\.claude\launch.json`.

## Verified local toolchain

- Node.js 22.22.0 is the project default (`.nvmrc`); Node.js 24.16.0 is also installed.
- Bun 1.3.14 and pnpm 11.20.0 remain available for templates that use them.
- Yarn Classic 1.22.22 is installed for official Midnight starter parity.
- Compact CLI 0.5.1 with compiler 0.31.1 is installed.
- Git 2.34.1 and Docker 29.0.1 are available in WSL. Claude Code is not
  currently installed in the WSL shell; the official Midnight Expert Claude
  plugin installer therefore remains pending until that prerequisite exists.

## Validation

For the citizen UI prototype on Windows, run the root workspace command. Use
`localhost`, not `127.0.0.1`, because Passport passkeys require a valid HTTPS
origin or the localhost relying-party domain:

```powershell
Copy-Item ui/.env.example ui/.env
npm.cmd run dev -- --host localhost --port 4173 --strictPort
```

The demo flow stores only local demo receipts in browser storage. It never
requests real DNI/passport documents. `VITE_APP_MODE=preview` enables Lace
Preview discovery and Midnight provider assembly; it does not claim a real
contract submission until the deployed address and generated witness/client
artifacts are configured.

Run the contract compiler and simulator checks from the repository root. The
compiler wrapper accepts `COMPACTC_BIN` (or `COMPACT_BIN` for the legacy CLI),
so Windows does not accidentally invoke the built-in NTFS `compact.exe`:

```bash
COMPACTC_BIN=/path/to/compactc npm run validate:contract
```

The normal Windows workflow is:

```powershell
npm.cmd run dev -- --host localhost --port 4173
npm.cmd test
npm.cmd run build
```

`npm run build` synchronizes the generated contract runtime, keys, and ZKIR
assets into the API and `ui/public/managed/referendum`. The wallet-less demo
is the default; set `VITE_APP_MODE=preview` only when a deployed contract
address, DApp Connector wallet, and Preview configuration are available.
These checks are deterministic and do not replace Preview integration testing.
The current Passport integration supplies profile consent, display identity,
and an app-scoped profile ID; contract approval still happens through the
official DApp Connector until Passport exposes reviewed generic contract
execution. The profile links to Midnight Domains for now; in-app `.night`
claiming remains a follow-up requiring verified wallet write operations and
DUST/payment handling.

## Before publishing

Run the Compact compile and simulator tests, inspect `git status`, and confirm
that no private vault material, credentials, or generated artifacts are tracked.
Use Apache License 2.0 for the public submission.
