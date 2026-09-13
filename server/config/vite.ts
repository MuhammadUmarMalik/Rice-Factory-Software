import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, "..", "..", "client");
const viteConfigPath = path.join(clientDir, "vite.config.ts");

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    configFile: viteConfigPath,
    root: clientDir,
    // Vite routes every recoverable problem through logger.error - a syntax
    // error in a file you just saved, an unresolved import, a failed HMR
    // transform. Exiting here killed the API server too, so the browser's next
    // dynamic import failed with "Failed to fetch dynamically imported module"
    // instead of showing Vite's error overlay. Log and keep serving; a fix on
    // disk then recovers on the next request.
    customLogger: viteLogger,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use(async (req, res, next) => {
    const url = req.originalUrl;

    // Only real navigations get the SPA shell. Module and asset requests send
    // `Accept: */*`, and answering those with index.html made a failed Vite
    // transform look like a 200 text/html response - which helmet's nosniff
    // then rejects as a module script, hiding the actual syntax error behind
    // "Failed to fetch dynamically imported module". Let them 404 instead.
    const wantsHtml = req.headers.accept?.includes("text/html") ?? false;
    if ((req.method !== "GET" && req.method !== "HEAD") || !wantsHtml) {
      return next();
    }

    try {
      const clientTemplate = path.join(clientDir, "index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
