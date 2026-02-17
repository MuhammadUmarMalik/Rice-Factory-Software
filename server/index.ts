import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { ensureDesktopAdmin } from "./utils/bootstrap";
import { ensureSchema } from "./utils/ensure-schema";
import { ensureDesktopSecret } from "./utils/desktop-secret";
import { serveStatic } from "./config/static";
import { createServer } from "http";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";

const app = express();
const httpServer = createServer(app);
const MemoryStore = createMemoryStore(session);
ensureDesktopSecret();
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
const forceHttps = process.env.FORCE_HTTPS === "true";

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET or JWT_SECRET must be set in production.");
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.disable("x-powered-by");
app.use(compression());
app.set("etag", "weak");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

if (isProduction && forceHttps) {
  app.use((req, res, next) => {
    const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    if (proto === "https") return next();
    const host = req.headers.host;
    if (!host) return res.status(400).json({ message: "Invalid host" });
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
}

app.use(
  express.json({
    limit: "100mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "100mb" }));

app.set("trust proxy", 1);
app.use(
  session({
    secret: sessionSecret || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8,
    },
    store: new MemoryStore({
      checkPeriod: 1000 * 60 * 60,
    }),
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/bootstrap", authLimiter);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  if (req.method === "GET") {
    if (req.path.startsWith("/api/auth")) {
      res.setHeader("Cache-Control", "no-store");
      return next();
    }
    res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=30");
    res.setHeader("Vary", "Authorization, Accept-Encoding");
    return next();
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});

(async () => {
  ensureSchema();
  await ensureDesktopAdmin();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error(err);
    if (isProduction && status >= 500) {
      return res.status(status).json({ message: "Internal Server Error" });
    }
    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./config/vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const startingPort = parseInt(process.env.PORT || "5000", 10);
  const maxRetries = 5;

  const listen = (port: number, attemptsLeft: number) => {
    httpServer.once("error", (err: any) => {
      if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
        const nextPort = port + 1;
        log(`port ${port} in use, trying ${nextPort}`, "express");
        listen(nextPort, attemptsLeft - 1);
        return;
      }
      throw err;
    });

    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
      },
      () => {
        log(`serving on port ${port}`);
      },
    );
  };

  listen(startingPort, maxRetries);
})();
