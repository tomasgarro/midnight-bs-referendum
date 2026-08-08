#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'Linux setup error: %s\n' "$1" >&2
  exit 1
}

[[ "$(uname -s)" == "Linux" ]] || fail "run this script inside Linux or WSL, not PowerShell."

node_bin="$(command -v node || true)"
npm_bin="$(command -v npm || true)"
[[ -n "$npm_bin" ]] || fail "npm is missing. Load the Linux Node.js installation before continuing."
case "$npm_bin" in
  /mnt/*) fail "WSL is using Windows npm at $npm_bin. Install/load Linux Node.js with nvm inside WSL." ;;
esac
[[ -n "$node_bin" ]] || fail "Node.js is missing. Install/load nvm in WSL, then run: nvm install && nvm use"

case "$node_bin" in
  /mnt/*) fail "WSL is using a Windows Node.js binary at $node_bin. Install Node.js with nvm inside WSL and ensure it appears first in PATH." ;;
esac

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge 22 ]] || fail "Node.js 22 or newer is required; found $(node --version)."

printf 'Using Linux toolchain:\n  node: %s (%s)\n  npm:  %s (%s)\n' \
  "$(node --version)" "$node_bin" "$(npm --version)" "$npm_bin"

npm install --workspaces --include-workspace-root

if [[ ! -f ui/.env ]]; then
  cp ui/.env.example ui/.env
  printf 'Created ui/.env from ui/.env.example\n'
fi

if [[ -n "${COMPACTC_BIN:-}" ]] || [[ -n "${COMPACT_BIN:-}" ]] \
  || (command -v compactc >/dev/null 2>&1 && compactc --version >/dev/null 2>&1) \
  || (command -v compact >/dev/null 2>&1 && compact compile --version >/dev/null 2>&1); then
  printf 'Compact compiler detected. Preview asset generation is available.\n'
  npm run compile
  npm run build --workspace midnight-referendum-api
  npm test
else
  printf 'Demo dependencies are installed. Full tests and Preview builds need compactc; see DEVELOPMENT.md.\n'
fi

printf '\nStart the demo with:\n  npm run dev -- --host localhost --port 4173 --strictPort\n'
