import type { Request, RequestHandler } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "../models/storage";
import { ensureDesktopSecret } from "./desktop-secret";

ensureDesktopSecret();
const isProduction = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || (isProduction ? "" : "dev-secret");
if (isProduction && !JWT_SECRET) {
  throw new Error("JWT_SECRET or SESSION_SECRET must be set in production.");
}
const JWT_ISSUER = "mill-manager";
const JWT_AUDIENCE = "mill-manager-ui";
const HASH_PREFIX = "pbkdf2";
const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = "sha256";

export type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive?: boolean;
};

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { sub: String(user.id), role: user.role },
    JWT_SECRET,
    { expiresIn: "8h", issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  );
}

function safeCompare(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(plain, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString("hex");
  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string): { ok: boolean; needsUpgrade: boolean } {
  if (!stored || !stored.startsWith(`${HASH_PREFIX}$`)) {
    return { ok: safeCompare(plain, stored), needsUpgrade: true };
  }

  const parts = stored.split("$");
  if (parts.length !== 4) return { ok: false, needsUpgrade: false };
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isFinite(iterations) || !salt || !expected) return { ok: false, needsUpgrade: false };
  const hash = crypto.pbkdf2Sync(plain, salt, iterations, HASH_KEYLEN, HASH_DIGEST).toString("hex");
  return { ok: safeCompare(hash, expected), needsUpgrade: false };
}

export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    if (req.user) return next();

    if (req.session?.userId) {
      const user = await storage.getUser(req.session.userId);
      if (!user || !user.isActive) {
        req.session.destroy(() => undefined);
        return next();
      }
      req.user = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      try {
        const payload = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
        if (typeof payload === "object" && payload?.sub) {
          const userId = Number(payload.sub);
          if (Number.isFinite(userId)) {
            const user = await storage.getUser(userId);
            if (user && user.isActive) {
              req.user = {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                isActive: user.isActive,
              };
            }
          }
        }
      } catch {
        // Ignore invalid tokens and fall back to unauthenticated.
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
};

export function getUserRole(req: Request): string {
  return req.user?.role?.toLowerCase() || "operator";
}

export function getUserId(req: Request): number | undefined {
  return req.user?.id;
}

export function requireRoles(allowed: string[]) {
  const allow = allowed.map((r) => r.toLowerCase());
  return (req: Request, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const role = getUserRole(req);
    if (role === "admin") {
      return next();
    }
    if (!allow.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
