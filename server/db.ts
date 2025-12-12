import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "@shared/schema";

const dbPath = process.env.DATABASE_URL || path.resolve(".local", "data.db");
const dbDir = path.dirname(dbPath.startsWith("file:") ? dbPath.replace("file:", "") : dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath.startsWith("file:") ? dbPath.replace("file:", "") : dbPath);
export const db = drizzle(sqlite, { schema });
