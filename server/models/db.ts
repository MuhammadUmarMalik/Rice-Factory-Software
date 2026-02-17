import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "../db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

const appDataDir = process.env.APP_DATA_DIR;
const defaultDbPath = appDataDir
  ? path.join(appDataDir, "data.db")
  : path.join(serverRoot, "..", ".local", "data.db");
const dbPath = process.env.DATABASE_URL || defaultDbPath;
export const resolvedDbPath = dbPath.startsWith("file:") ? dbPath.replace("file:", "") : dbPath;
const dbDir = path.dirname(resolvedDbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const sqlite = new Database(resolvedDbPath);
export const db = drizzle(sqlite, { schema });
