import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { sqlite, resolvedDbPath } from "../models/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");

function hasUsersTable(): boolean {
  try {
    const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    return Boolean(row);
  } catch {
    return false;
  }
}

function getAccountsColumnNames(): string[] {
  try {
    const rows = sqlite.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

function ensureAccountsColumns(): void {
  const columns = getAccountsColumnNames();
  if (columns.length === 0) return; // no accounts table yet

  if (!columns.includes("parent_id")) {
    sqlite.prepare("ALTER TABLE accounts ADD COLUMN parent_id integer REFERENCES accounts(id)").run();
  }
  if (!columns.includes("level")) {
    sqlite.prepare("ALTER TABLE accounts ADD COLUMN level integer NOT NULL DEFAULT 0").run();
  }
}

/**
 * Ensures the SQLite database has the application schema (e.g. users table).
 * If the schema is missing, runs `drizzle-kit push` so dev and Electron work without a manual db:push.
 * Also adds any missing columns to existing tables (e.g. accounts.parent_id, accounts.level).
 */
export function ensureSchema(): void {
  if (!hasUsersTable()) {
    const absolutePath = path.resolve(resolvedDbPath);
    const databaseUrl = "file:" + absolutePath.replace(/\\/g, "/");
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_OPTIONS: (process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + " " : "") + "--import tsx",
    };

    try {
      execSync("npx drizzle-kit push", {
        cwd: serverDir,
        env,
        stdio: "inherit",
      });
    } catch {
      const msg =
        "Database schema is missing (no 'users' table). From the project root run:\n  npm run db:push --prefix server\nThen start the app again.";
      console.error(msg);
      throw new Error(msg);
    }
    return;
  }

  ensureAccountsColumns();
}
