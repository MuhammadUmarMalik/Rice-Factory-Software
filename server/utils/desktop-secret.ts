import crypto from "crypto";
import fs from "fs";
import path from "path";

const DESKTOP_FLAG = process.env.DESKTOP_BUILD === "1";

function loadSecretFromDisk(secretsPath: string): string {
  try {
    if (!fs.existsSync(secretsPath)) return "";
    const raw = fs.readFileSync(secretsPath, "utf8");
    const parsed = JSON.parse(raw) as { sessionSecret?: string; jwtSecret?: string };
    return parsed.sessionSecret || parsed.jwtSecret || "";
  } catch {
    return "";
  }
}

function persistSecret(secretsPath: string, secret: string) {
  try {
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
    fs.writeFileSync(secretsPath, JSON.stringify({ sessionSecret: secret }, null, 2));
  } catch {
    // If we cannot persist, fall back to in-memory secret only.
  }
}

export function ensureDesktopSecret() {
  if (!DESKTOP_FLAG) return;
  if (process.env.SESSION_SECRET || process.env.JWT_SECRET) return;

  const baseDir = process.env.APP_DATA_DIR || "";
  const secretsPath = baseDir ? path.join(baseDir, "secrets.json") : "";
  let secret = secretsPath ? loadSecretFromDisk(secretsPath) : "";

  if (!secret) {
    secret = crypto.randomBytes(48).toString("hex");
    if (secretsPath) {
      persistSecret(secretsPath, secret);
    }
  }

  process.env.SESSION_SECRET = secret;
}
