import fs from "node:fs";
import path from "node:path";

const target = path.resolve("dist-desktop", "win-unpacked");

try {
  fs.rmSync(target, { recursive: true, force: true });
} catch (error) {
  console.error("Failed to clean desktop build output:", error?.message || error);
  console.error("Close any running Mill Manager app and try again.");
  process.exit(1);
}
