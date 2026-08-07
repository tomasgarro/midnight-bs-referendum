# Hack Buenos Aires project

This project is built on the Midnight Network.

This is the clean public-repository boundary for the Midnight Hack Buenos Aires project.

Implementation starts during the official contest period. Private research, Obsidian notes,
recordings, credentials, and personal data remain outside this repository.

The first implementation slice is the Compact referendum contract in
`contracts/referendum`. The application target is Midnight Preview; Lace and
the Preview faucet are already handled outside this repository.

Preview services:

- Node RPC: `https://rpc.preview.midnight.network`
- Indexer GraphQL: `https://indexer.preview.midnight.network/api/v4/graphql`
- Local proof server: `http://localhost:6300`

Compile from the repository root with:

```bash
compact compile contracts/referendum/referendum.compact contracts/referendum/managed/referendum
```

After installing the pinned JavaScript dependencies, run the deterministic
simulator checks with `yarn validate:contract`. Preview integration will use
the versions recorded in [DEVELOPMENT.md](DEVELOPMENT.md) and the [official
compatibility matrix](https://docs.midnight.network/relnotes/support-matrix).

## Civic DApp preview

The mobile-first citizen experience lives in `ui/`. It defaults to a demo
mode so anyone can explore `Entendé`, `Votaciones`, and `Verificá` without a
wallet. The simulated eligibility step starts only after selecting `Votá
ahora`.

From the project root:

```powershell
npm.cmd install --workspaces
Copy-Item ui/.env.example ui/.env
npm.cmd run dev --workspace midnight-referendum-ui -- --host 0.0.0.0 --port 4173 --strictPort
```

Open `http://localhost:4173/`. Set `VITE_APP_MODE=preview` in `ui/.env` to
enable Lace Preview discovery. The wallet connector and provider assembly are
implemented, but the citizen vote remains explicitly labeled as demo until a
deployed contract address, managed ZK assets, and the generated witness/client
adapter are supplied. This keeps the prototype honest while preserving the
Preview integration boundary.

## Development

The project is developed inside Ubuntu on WSL2 with the Compact toolchain and
the Preview services. The Midnight Expert reference is mirrored locally at
`C:\Users\tomas\Desktop\Midnight\.midnight-expert\upstream`; the relevant
Codex skills are installed in the user skill directory. See
[DEVELOPMENT.md](DEVELOPMENT.md) for the exact workflow.

## License

Apache License 2.0. See [LICENSE](LICENSE).
