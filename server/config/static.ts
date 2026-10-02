import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/*
 * The client build always sits next to the server bundle, at dist/public.
 * __dirname is the only reliable way to find it: esbuild emits a CJS bundle at
 * dist/index.cjs, so __dirname is the dist directory in production and the
 * dist directory *inside app.asar* once packaged. process.cwd() is useless in
 * a packaged app - it points at the folder holding the .exe, which is why the
 * installed build used to die with "Could not find the build directory".
 *
 * __dirname is undefined in dev, where the ESM sources run under tsx with cwd
 * set to server/, so the cwd-relative candidates stay as the fallback.
 */
const candidates = [
  typeof __dirname === "string" ? path.join(__dirname, "public") : null,
  path.resolve(process.cwd(), "dist", "public"),
  path.resolve(process.cwd(), "..", "dist", "public"),
].filter((candidate): candidate is string => candidate !== null);

const distPathResolved = candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];

export function serveStatic(app: Express) {
  if (!fs.existsSync(distPathResolved)) {
    throw new Error(
      `Could not find the build directory (tried ${candidates.join(", ")}), make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPathResolved, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use((_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPathResolved, "index.html"));
  });
}
