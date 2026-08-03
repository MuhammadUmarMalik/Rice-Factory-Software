import esbuild from "esbuild";
import path from "path";
import { rm } from "fs/promises";

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const outDir = path.join(dist, "electron");

async function buildFile(entry: string, outfile: string) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile,
    sourcemap: true,
    external: ["electron"],
    format: "cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    alias: {
      // allow imports that mirror the client aliases if ever used
      "@": path.join(root, "client"),
      "@assets": path.join(root, "client", "src"),
    },
  });
}

async function main() {
  // ensure the dist/electron folder is clean so builder picks up the compiled files
  await rm(outDir, { recursive: true, force: true });
  await buildFile(path.join(root, "electron", "main.cjs"), path.join(outDir, "main.cjs"));
  await buildFile(path.join(root, "electron", "preload.cjs"), path.join(outDir, "preload.cjs"));
  console.log("electron entrypoints compiled");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});