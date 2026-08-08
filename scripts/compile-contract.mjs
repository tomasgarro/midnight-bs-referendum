import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const source = path.join(projectDirectory, "contracts", "referendum", "referendum.compact");
const target = path.join(projectDirectory, "contracts", "referendum", "managed", "referendum");

mkdirSync(target, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectDirectory,
    stdio: "inherit",
    windowsHide: true,
  });
  return result.error ? null : result.status;
}

const compactc = process.env.COMPACTC_BIN?.trim();
const compact = process.env.COMPACT_BIN?.trim();

let status = compactc ? run(compactc, [source, target]) : null;
if (status === null && !compactc && process.platform !== "win32") {
  status = run("compactc", [source, target]);
}
if (status === null && compact) status = run(compact, ["compile", source, target]);

if (status === null) {
  console.error(
    "Compact compiler not found. Set COMPACTC_BIN to compactc (or COMPACT_BIN to the legacy compact CLI) before running npm run compile.",
  );
  process.exit(1);
}

process.exit(status ?? 1);
