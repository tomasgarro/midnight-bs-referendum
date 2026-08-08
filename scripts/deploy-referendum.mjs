/**
 * Deploys the referendum contract to Midnight Preview and issues eligibility
 * commitments, using the relayer wallet to pay for both.
 *
 * Usage (from the repository root, inside WSL/Linux):
 *
 *   npm run deploy:preview                 # deploy a fresh referendum
 *   npm run deploy:preview -- --issue HEX  # add an eligibility commitment
 *
 * Reads relayer/.env for RELAYER_SEED and the Preview endpoints. The seed is
 * never printed. On success it prints the contract address to paste into
 * ui/.env as VITE_MIDNIGHT_CONTRACT_ADDRESS.
 *
 * The issuer and organizer secrets are derived from the relayer seed with
 * domain separation, so the same .env reproduces the same authority keys and
 * a redeploy is not needed to run close/reveal/finalize later.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import WebSocket from "ws";
globalThis.WebSocket ??= WebSocket;

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const seedHex = (process.env.RELAYER_SEED ?? "").trim().toLowerCase().replace(/^0x/, "");
if (!/^[0-9a-f]{64}$/.test(seedHex)) {
  fail(
    "RELAYER_SEED is missing or malformed.\n" +
      "Copy relayer/.env.example to relayer/.env, generate a seed, and fund it first:\n" +
      "  npm run relayer:address",
  );
}

/** Domain-separated so the issuer key is not the wallet key. */
function roleSecret(label) {
  return new Uint8Array(
    createHash("sha256").update(`referendum:role:${label}:`).update(Buffer.from(seedHex, "hex")).digest(),
  );
}

const args = process.argv.slice(2);
const issueIndex = args.indexOf("--issue");
const issueCommitment = issueIndex >= 0 ? args[issueIndex + 1] : null;
if (issueIndex >= 0 && !/^[0-9a-f]{64}$/i.test(issueCommitment ?? "")) {
  fail("--issue expects a 32-byte commitment as 64 hex characters.");
}

const { loadConfig } = await import("../relayer/dist/config.js");
const api = await import("../api/dist/index.js");

const config = loadConfig();
const relayerUrl = `http://${config.host}:${config.port}`;
console.log(`network: ${config.networkId}`);

// Talk to the running relayer rather than starting a second wallet on the same
// seed: two wallets balancing from the same coins is asking for trouble, and a
// second full sync costs minutes for information the relayer already has.
const health = await fetch(`${relayerUrl}/health`)
  .then((r) => r.json())
  .catch(() => null);
if (!health) {
  fail(`The relayer is not answering on ${relayerUrl}.\nStart it first:  npm run relayer`);
}
console.log(`relayer address: ${health.unshieldedAddress}`);
console.log(`relayer DUST:    ${health.dustBalance}`);
if (BigInt(health.dustBalance ?? "0") <= 0n) {
  fail(
    "The relayer has no DUST, so it cannot pay for a deployment.\n" +
      "Fund its address with Preview tNIGHT, then run:  npm run relayer:dust",
  );
}


  // The deploy path talks to the chain through the same relayer-backed
  // providers the browser uses, so a successful deploy also proves the
  // relayer wiring end to end.
  // Node's fetch cannot open file:// URLs, so the browser's HTTP-based
  // FetchZkConfigProvider is useless here — read the assets off disk instead.
  const { NodeZkConfigProvider } = await import(
    "@midnight-ntwrk/midnight-js-node-zk-config-provider"
  );
  const providers = await api.createRelayerProviders({
    relayerUrl,
    proofServerUri: config.provingServerUrl,
    networkId: config.networkId,
    indexerUri: config.indexerHttpUrl,
    indexerWsUri: config.indexerWsUrl,
    zkConfigProvider: new NodeZkConfigProvider(
      resolve(ROOT, "contracts/referendum/managed/referendum"),
    ),
  });

  const issuerSecret = roleSecret("issuer");
  const organizerSecret = roleSecret("organizer");

  const executor = api.createReferendumExecutor(providers, {
    issuerSecret,
    organizerSecret,
    eventId: new Uint8Array(createHash("sha256").update("referendum:event:v1").digest()),
    explorerBaseUrl:
      process.env.MIDNIGHT_EXPLORER_BASE_URL ?? "https://explorer.preview.midnight.network/tx",
  });

  const envPath = resolve(ROOT, "ui/.env");
  const currentEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const existingAddress = /^VITE_MIDNIGHT_CONTRACT_ADDRESS=(.+)$/m.exec(currentEnv)?.[1]?.trim();

  if (issueCommitment) {
    if (!existingAddress) {
      fail("No contract address in ui/.env. Deploy first, then use --issue.");
    }
    console.log(`joining ${existingAddress} to issue eligibility…`);
    await executor.join(existingAddress, api.createReferendumPrivateState({ issuerSecret, organizerSecret }));
    const receipt = await executor.issue(Uint8Array.from(Buffer.from(issueCommitment, "hex")));
    console.log(`\nissued. tx ${receipt.txHash}`);
    console.log(receipt.explorerUrl);
  } else {
    console.log("deploying the referendum contract…");
    const deployed = await executor.deploy(
      api.createReferendumPrivateState({ issuerSecret, organizerSecret }),
    );
    const address =
      deployed?.deployTxData?.public?.contractAddress ?? deployed?.contractAddress ?? null;
    if (!address) {
      console.log(JSON.stringify(deployed, null, 2));
      fail("Deployment returned no contract address; inspect the payload above.");
    }

    console.log(`\ncontract address: ${address}`);
    const nextEnv = currentEnv.includes("VITE_MIDNIGHT_CONTRACT_ADDRESS=")
      ? currentEnv.replace(/^VITE_MIDNIGHT_CONTRACT_ADDRESS=.*$/m, `VITE_MIDNIGHT_CONTRACT_ADDRESS=${address}`)
      : `${currentEnv.trimEnd()}\nVITE_MIDNIGHT_CONTRACT_ADDRESS=${address}\n`;
    writeFileSync(envPath, nextEnv);
    console.log(`written to ui/.env`);
    console.log("\nnext: set VITE_APP_MODE=preview in ui/.env and restart the dev server.");
  }
process.exit(0);
