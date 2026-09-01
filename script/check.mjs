#!/usr/bin/env node
/**
 * Cross-platform check: run client and server type checks.
 * Exits with 1 if either fails, 0 if both pass.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cwd, cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: true, stdio: "inherit" });
    child.on("close", (code) => resolve(code));
  });
}

async function main() {
  const clientCode = await run(path.join(root, "client"), "npm", ["run", "check"]);
  const serverCode = await run(path.join(root, "server"), "npm", ["run", "check"]);
  const failed = clientCode !== 0 || serverCode !== 0;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
