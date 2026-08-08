import * as rx from "rxjs";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import { loadConfig } from "./config.js";
import { startRelayerWallet } from "./wallet.js";

/**
 * Prints the relayer's public addresses so it can be funded, then exits.
 * Run this before starting the server for the first time:
 *
 *     npm run address --workspace midnight-referendum-relayer
 *
 * Send Preview NIGHT to the unshielded address, then register it for DUST
 * generation from a wallet you control. Without DUST the relayer can prove and
 * balance nothing, and every vote will fail at the fee step.
 */
const config = loadConfig();
console.log(`network: ${config.networkId}`);

const wallet = await startRelayerWallet(config);
try {
  // Addresses derive from the seed, so the first emitted state already has
  // them. Waiting for a full sync here just to print an address can cost
  // minutes on a fresh wallet — and this is the step that blocks funding.
  const state = await rx.firstValueFrom(wallet.facade.state());
  console.log("");
  const bech32 = (item: unknown) =>
    MidnightBech32m.encode(config.networkId, item as never).asString();
  console.log(`unshielded (fund this with NIGHT): ${bech32(state.unshielded.address)}`);
  console.log(`shielded:                          ${bech32(state.shielded.address)}`);
  console.log(`dust:                              ${bech32(state.dust.address)}`);
  console.log("");
  console.log(`dust balance now: ${state.dust.balance(new Date()).toString()}`);
} finally {
  await wallet.stop();
}
process.exit(0);
