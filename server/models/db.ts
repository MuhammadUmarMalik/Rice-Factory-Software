import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "../db/schema";

function resolveProjectRoot() {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "server"
    ? path.resolve(cwd, "..")
    : cwd;
}

const projectRoot = resolveProjectRoot();

const appDataDir = process.env.APP_DATA_DIR;
const defaultDbPath = appDataDir
  ? path.join(appDataDir, "data.db")
  : path.join(projectRoot, ".local", "data.db");
const dbPath = process.env.DATABASE_URL || defaultDbPath;
export const resolvedDbPath = dbPath.startsWith("file:") ? dbPath.replace("file:", "") : dbPath;
const dbDir = path.dirname(resolvedDbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const sqlite = new Database(resolvedDbPath);

/**
 * Additive column migrations, applied before anything queries the database.
 *
 * The .sql files in script/ are not run automatically, so a column added to
 * db/schema.ts would otherwise break every SELECT against an existing database
 * ("no such column"). Same idea as the ensureTables() calls in the services,
 * one level lower because these columns sit on tables read during login.
 */
function ensureColumn(table: string, column: string, definition: string) {
  const tableExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  if (!tableExists) return; // Fresh database; drizzle push creates it with the column.

  const columns = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) return;

  sqlite.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`);
}

// Mirrors script/0003_users_must_change_password.sql.
ensureColumn("users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");

export const db = drizzle(sqlite, { schema });
