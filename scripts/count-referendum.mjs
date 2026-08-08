/**
 * Organizer-side counting for a referendum: closeVote, then revealVote for each
 * ballot, then finalizeVote. This is the ending the referendum otherwise does
 * not have — the contract and executor already support it, but nothing drives
 * it.
 *
 * Usage (from the repository root, inside WSL/Linux, with the relayer running):
 *
 *   CONTRACT_ADDRESS=<hex> node --env-file-if-exists=relayer/.env \
 *     scripts/count-referendum.mjs --ballot YES:<salt-hex> --ballot NO:<salt-hex>
 *
 *   --close-only     close the commit phase and stop
 *   --no-finalize    reveal without finalizing, so more reveals can follow
 *
 * A ballot is a (choice, salt) pair. The salt is printed by cast-vote-e2e.mjs
 * when the vote is cast and is the only way to reveal that ballot: the contract
 * stores just persistentCommit(choice, salt), so a lost salt is an uncountable
 * vote. Revealing publishes the choice and the commitment, never the voter's
 * eligibility commitment or nullifier, so the tally never becomes a roster.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";
globalThis.WebSocket ??= WebSocket;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

const ballots = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] !== "--ballot") continue;
  const [choice, salt] = String(argv[i + 1] ?? "").split(":");
  if (!["YES", "NO", "ABSTAIN"].includes(choice) || !/^[0-9a-f]{64}$/i.test(salt ?? "")) {
    console.error(`--ballot expects CHOICE:SALT, e.g. YES:<64 hex>. Got: ${argv[i + 1]}`);
    process.exit(1);
  }
  ballots.push({ choice, salt: Uint8Array.from(Buffer.from(salt, "hex")) });
}

const seedHex = (process.env.RELAYER_SEED ?? "").trim().toLowerCase().replace(/^0x/, "");
if (!/^[0-9a-f]{64}$/.test(seedHex)) {
  console.error("RELAYER_SEED is missing. Run with --env-file-if-exists=relayer/.env");
  process.exit(1);
}
const roleSecret = (label) =>
  new Uint8Array(
    createHash("sha256").update(`referendum:role:${label}:`).update(Buffer.from(seedHex, "hex")).digest(),
  );

const envPath = resolve(ROOT, "ui/.env");
const contractAddress =
  process.env.CONTRACT_ADDRESS ??
  (existsSync(envPath)
    ? /^VITE_MIDNIGHT_CONTRACT_ADDRESS=(.+)$/m.exec(readFileSync(envPath, "utf8"))?.[1]?.trim()
    : null);
if (!contractAddress) {
  console.error("No contract address. Set CONTRACT_ADDRESS or deploy first.");
  process.exit(1);
}

const api = await import(`${ROOT}/api/dist/index.js`);
const { loadConfig } = await import(`${ROOT}/relayer/dist/config.js`);
const { NodeZkConfigProvider } = await import("@midnight-ntwrk/midnight-js-node-zk-config-provider");
const runtime = await import("@midnight-ntwrk/compact-runtime");
const generated = await import(`${ROOT}/api/dist/generated/referendum/index.js`);

const config = loadConfig();
const providers = await api.createRelayerProviders({
  relayerUrl: `http://${config.host}:${config.port}`,
  proofServerUri: config.provingServerUrl,
  networkId: config.networkId,
  indexerUri: config.indexerHttpUrl,
  indexerWsUri: config.indexerWsUrl,
  zkConfigProvider: new NodeZkConfigProvider(resolve(ROOT, "contracts/referendum/managed/referendum")),
});

const issuerSecret = roleSecret("issuer");
const organizerSecret = roleSecret("organizer");
const basePrivateState = api.createReferendumPrivateState({ issuerSecret, organizerSecret });
const executor = api.createReferendumExecutor(providers, {
  issuerSecret,
  organizerSecret,
  eventId: new Uint8Array(createHash("sha256").update("referendum:event:v1").digest()),
});

const readLedger = async () => {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  return generated.ledger(state.data);
};
const showTally = async (label) => {
  const ledger = await readLedger();
  const tally = [...ledger.tally].map(([c, n]) => `${["YES", "NO", "ABSTAIN"][c] ?? c}=${n}`);
  console.log(`${label}: phase=${ledger.phase} closed=${ledger.closed} tally=${tally.join(" ") || "(hidden)"}`);
};

// The Choice enum is a 2-value, 1-byte Compact enum; this must match the
// contract's persistentCommit<Choice> exactly or no reveal will ever match.
const choiceType = new runtime.CompactTypeEnum(2, 1);
const commitmentFor = ({ choice, salt }) =>
  runtime.persistentCommit(choiceType, generated.Choice[choice], salt);

await executor.join(contractAddress, basePrivateState);
await showTally("before");

const ledgerNow = await readLedger();
if (ledgerNow.phase === "COMMIT" || Number(ledgerNow.phase) === 0) {
  console.log("\nclosing the commit phase…");
  const receipt = await executor.closeVote();
  console.log(`closed. tx ${receipt.txHash}`);
} else {
  console.log("\nalready past the commit phase; skipping closeVote");
}
if (argv.includes("--close-only")) {
  await showTally("after");
  process.exit(0);
}

for (const ballot of ballots) {
  const commitment = commitmentFor(ballot);
  const ledger = await readLedger();
  const revealPath = ledger.ballotCommitments.findPathForLeaf(commitment);
  if (!revealPath) {
    console.error(
      `\nno ballot in this referendum matches ${ballot.choice} with that salt ` +
        `(commitment ${Buffer.from(commitment).toString("hex")}). ` +
        `The salt must be the one printed when that vote was cast.`,
    );
    process.exit(1);
  }
  // The witness is read at proving time, so the path has to be in private state
  // before the call; re-joining is how the executor picks up the new value.
  await executor.join(contractAddress, { ...basePrivateState, revealPath });
  const receipt = await executor.revealVote(ballot.choice, ballot.salt);
  console.log(`revealed ${ballot.choice}. tx ${receipt.txHash}`);
}

if (!argv.includes("--no-finalize")) {
  console.log("\nfinalizing…");
  const receipt = await executor.finalizeVote();
  console.log(`finalized. tx ${receipt.txHash}`);
}

await showTally("after");
process.exit(0);
