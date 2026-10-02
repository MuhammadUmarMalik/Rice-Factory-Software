/*
 * `npm rebuild better-sqlite3` exits 0 even when npm refuses to run the
 * package's install script (npm >= 12 blocks install scripts that are not
 * listed under "allowScripts" in package.json). The stale binary is then
 * whatever `electron-rebuild` left behind - built for Electron's ABI, not
 * Node's - and the failure only surfaces minutes later, inside a build step,
 * as an ERR_DLOPEN_FAILED with no hint about the cause.
 *
 * This runs straight after the rebuild so the mismatch is caught immediately
 * and explained.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  const Database = require("better-sqlite3");
  new Database(":memory:").close();
} catch (error) {
  const message = error?.message || String(error);
  console.error("better-sqlite3 cannot be loaded by Node.");
  console.error(`  node ${process.version} needs NODE_MODULE_VERSION ${process.versions.modules}`);
  console.error(`  ${message.split("\n").join(" ")}`);
  console.error("");
  console.error("The binary was not rebuilt for Node. Most likely npm skipped the");
  console.error("install script. Check with:");
  console.error("  npm install-scripts ls");
  console.error("and approve better-sqlite3 if it is listed:");
  console.error("  npm install-scripts approve better-sqlite3");
  process.exit(1);
}
