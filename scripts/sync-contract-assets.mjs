import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const managed = path.join(root, "contracts", "referendum", "managed", "referendum");
const apiGenerated = path.join(root, "api", "src", "generated", "referendum");
const apiDistGenerated = path.join(root, "api", "dist", "generated", "referendum");
const uiManaged = path.join(root, "ui", "public", "managed", "referendum");

await mkdir(apiGenerated, { recursive: true });
await mkdir(uiManaged, { recursive: true });
await mkdir(apiDistGenerated, { recursive: true });
await cp(path.join(managed, "contract", "index.js"), path.join(apiGenerated, "index.js"));
await cp(path.join(managed, "contract", "index.d.ts"), path.join(apiGenerated, "index.d.ts"));
await cp(path.join(managed, "contract", "index.js.map"), path.join(apiGenerated, "index.js.map"));
await cp(path.join(managed, "contract", "index.js"), path.join(apiDistGenerated, "index.js"));
await cp(path.join(managed, "contract", "index.d.ts"), path.join(apiDistGenerated, "index.d.ts"));
await cp(path.join(managed, "contract", "index.js.map"), path.join(apiDistGenerated, "index.js.map"));
await rm(path.join(uiManaged, "keys"), { recursive: true, force: true });
await rm(path.join(uiManaged, "zkir"), { recursive: true, force: true });
await cp(path.join(managed, "keys"), path.join(uiManaged, "keys"), { recursive: true });
await cp(path.join(managed, "zkir"), path.join(uiManaged, "zkir"), { recursive: true });

console.log("Synchronized referendum contract runtime and ZK assets.");
