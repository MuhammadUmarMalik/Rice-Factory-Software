import { build } from "esbuild";
import { mkdir, rm, readFile } from "fs/promises";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const rootDir = path.resolve(serverRoot, "..");

const allowlist = [
  "compression",
  "cors",
  "date-fns",
  "decimal.js",
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
  await assertExternalsResolvable(serverBundlePath);
}

/*
 * Externals are required at runtime from the bundle's own directory, which in
 * the packaged app is app.asar/dist - so only root node_modules is on the
 * resolution path, not server/node_modules. Anything left external that only
 * exists under server/ ships broken ("Cannot find module 'decimal.js'"), so
 * fail the build here instead of at the user's first launch.
 */
async function assertExternalsResolvable(bundlePath) {
  const bundle = await readFile(bundlePath, "utf-8");
  const requested = new Set(
    Array.from(bundle.matchAll(/require\("([^".][^"]*)"\)/g), (m) => m[1])
      .filter((id) => !id.startsWith(".") && !id.startsWith("node:")),
  );
  const requireFromBundle = createRequire(bundlePath);
  const missing = [];
  for (const id of requested) {
    try {
      requireFromBundle.resolve(id);
    } catch {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `These modules stay external but cannot be resolved from dist/: ${missing.join(", ")}. ` +
        "Either add them to the bundle allowlist in server/scripts/build.mjs, " +
        "or install them in the root package.json so they ship next to the bundle.",
    );
  }
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
