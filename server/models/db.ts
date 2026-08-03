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
export const db = drizzle(sqlite, { schema });
