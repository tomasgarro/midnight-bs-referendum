# Development setup

This repository is the public code boundary. Keep Obsidian notes, recordings,
credentials, and other private material in the parent vault, not here.

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

## Verified toolchain

- Node.js 22.22.0 is the project default (`.nvmrc`); Node.js 24.16.0 is also installed.
- Bun 1.3.14 and pnpm 11.20.0 remain available for templates that use them.
- Yarn Classic 1.22.22 is installed for official Midnight starter parity.
- Compact CLI 0.5.1 with compiler 0.31.1 is installed.
- Git 2.34.1, Docker 29.0.1, and Claude Code 2.1.207 are available in WSL.

## Direct Midnight smoke test

The official Hello World acceptance copy is kept in the ignored parent-vault
directory `BS AS Hackathon/tmp/hello-world`, so generated keys and dependencies
cannot enter this public repository. From that directory:

```bash
yarn install
yarn compile
COMPOSE_PROJECT_NAME=hack-buenos-aires-hello yarn env:up
yarn test:local
```

The current local stack uses the official images for proof server 8.1.0,
indexer 4.3.3, and node 1.0.0. It listens only on localhost:

| Service | Port |
| --- | ---: |
| Proof server | 6300 |
| Indexer | 8088 |
| Midnight node | 9944 |

The proof server should return its version from `http://localhost:6300/version`.
Lace must be configured manually for `Local (http://localhost:6300)` before a
wallet-backed demo.

## Before publishing

Run the Compact compile and local tests, inspect `git status`, and confirm that
no private vault material or credentials are tracked. Use Apache License 2.0
for the public submission.
