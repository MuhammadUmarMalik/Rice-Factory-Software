import { build } from "esbuild";
import { rm, readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const rootDir = path.resolve(serverRoot, "..");

const allowlist = [
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "nanoid",
  "passport",
  "passport-local",
  "pg",
  "ws",
  "zod",
  "zod-validation-error",
];

async function buildServer() {
  const distDir = path.join(rootDir, "dist");
  await rm(distDir, { recursive: true, force: true });
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
    outfile: path.join(rootDir, "dist", "index.cjs"),
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
