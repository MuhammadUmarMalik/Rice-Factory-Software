import { build } from "esbuild";
import { mkdir, rm, readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const rootDir = path.resolve(serverRoot, "..");

const allowlist = [
  "compression",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "helmet",
  "jsonwebtoken",
  "nanoid",
  "zod",
  "zod-validation-error",
];

async function buildServer() {
  const distDir = path.join(rootDir, "dist");
  const serverBundlePath = path.join(distDir, "index.cjs");
  await mkdir(distDir, { recursive: true });
  await rm(serverBundlePath, { force: true });
  const outDir = path.join(serverRoot, "dist");
  await rm(outDir, { recursive: true, force: true });

  const pkgPath = path.join(serverRoot, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  console.log("building server...");
  await build({
    entryPoints: [path.join(serverRoot, "index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: serverBundlePath,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
  console.log("server built to dist/index.cjs");
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
