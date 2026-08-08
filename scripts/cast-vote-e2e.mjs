/**
 * Casts a real castVote transaction on Midnight Preview, end to end, without a
 * browser: it proves the circuit against the local proof server and lets the
 * funded relayer balance DUST and submit. This is the headless twin of what the
 * UI does, and it is the script used to produce the recorded demo tx.
 *
 * Usage (from the repository root, inside WSL/Linux, with the relayer running):
 *
 *   # 1. issue an eligibility commitment for the voter secret
 *   node scripts/cast-vote-e2e.mjs --commitment
 *   npm run deploy:preview -- --issue <printed commitment>
 *
 *   # 2. vote
 *   node --env-file-if-exists=relayer/.env scripts/cast-vote-e2e.mjs
 *   CHOICE=NO VOTER_SECRET=<64-hex> node ... scripts/cast-vote-e2e.mjs
 *
 * The voter secret defaults to a fixed test value so the flow is reproducible.
 * Citizens never need a wallet: the contract authorises castVote on Merkle
 * membership plus the nullifier, never on who submitted the transaction.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";
globalThis.WebSocket ??= WebSocket;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const secretHex = (process.env.VOTER_SECRET ?? "07".repeat(32)).trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(secretHex)) {
  console.error("VOTER_SECRET must be 64 hex characters.");
  process.exit(1);
}
const voterSecret = Uint8Array.from(Buffer.from(secretHex, "hex"));

const api = await import(`${ROOT}/api/dist/index.js`);

// --commitment prints the value to hand to `deploy:preview --issue` and exits,
// so the eligibility step needs no relayer and no chain access.
if (process.argv.includes("--commitment")) {
  console.log(Buffer.from(api.eligibilityCommitmentForSecret(voterSecret)).toString("hex"));
  process.exit(0);
}

const seedHex = (process.env.RELAYER_SEED ?? "").trim().toLowerCase().replace(/^0x/, "");
if (!/^[0-9a-f]{64}$/.test(seedHex)) {
  console.error("RELAYER_SEED is missing. Run with --env-file-if-exists=relayer/.env");
  process.exit(1);
}
/** Domain-separated so the issuer/organizer keys are not the wallet key. */
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
  console.error("No contract address in ui/.env. Deploy first: npm run deploy:preview");
  process.exit(1);
}

const { loadConfig } = await import(`${ROOT}/relayer/dist/config.js`);
const { NodeZkConfigProvider } = await import("@midnight-ntwrk/midnight-js-node-zk-config-provider");
const config = loadConfig();

// Node's fetch cannot open file:// URLs, so the browser's HTTP-based
// FetchZkConfigProvider is useless here — read the proving keys off disk.
const providers = await api.createRelayerProviders({
  relayerUrl: `http://${config.host}:${config.port}`,
  proofServerUri: config.provingServerUrl,
  networkId: config.networkId,
  indexerUri: config.indexerHttpUrl,
  indexerWsUri: config.indexerWsUrl,
  zkConfigProvider: new NodeZkConfigProvider(resolve(ROOT, "contracts/referendum/managed/referendum")),
});

const commitment = api.eligibilityCommitmentForSecret(voterSecret);
console.log(`commitment: ${Buffer.from(commitment).toString("hex")}`);

// Fails loudly if the organizer never issued this commitment, which is the
// single most common reason a castVote cannot be built.
const voterPath = await api.findEligibilityPath(providers, contractAddress, commitment);
console.log("eligibility path found in the on-chain tree");

const voteSalt = new Uint8Array(randomBytes(32));
const choice = process.env.CHOICE ?? "YES";

const issuerSecret = roleSecret("issuer");
const organizerSecret = roleSecret("organizer");
const executor = api.createReferendumExecutor(providers, {
  issuerSecret,
  organizerSecret,
  eventId: new Uint8Array(createHash("sha256").update("referendum:event:v1").digest()),
  explorerBaseUrl:
    process.env.MIDNIGHT_EXPLORER_BASE_URL ?? "https://explorer.preview.midnight.network/tx",
});

await executor.join(contractAddress, {
  ...api.createReferendumPrivateState({ issuerSecret, organizerSecret }),
  voterSecret,
  voterPath,
  voterChoice: choice,
  voteSalt,
});

console.log(`casting vote: ${choice}`);
const receipt = await executor.castVote();

console.log(`\ntx      ${receipt.txHash}`);
console.log(`block   ${receipt.blockHeight}  ${receipt.status}`);
console.log(receipt.explorerUrl);
// The ballot is a commitment; this salt is required to reveal it later, and
// losing it means the vote can never be counted.
console.log(`\nsalt (required to reveal this ballot): ${Buffer.from(voteSalt).toString("hex")}`);
process.exit(0);
