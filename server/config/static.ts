import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// Server runs from server/ (dev) or via dist/index.cjs (prod, often with cwd server/). Client build is at root dist/public.
const distPath = path.resolve(process.cwd(), "dist", "public");
const distPathFromServer = path.resolve(process.cwd(), "..", "dist", "public");
const distPathResolved = fs.existsSync(distPath) ? distPath : distPathFromServer;

export function serveStatic(app: Express) {
  if (!fs.existsSync(distPathResolved)) {
    throw new Error(
      `Could not find the build directory (tried ${distPath}, ${distPathFromServer}), make sure to build the client first`,
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
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPathResolved, "index.html"));
  });
}
