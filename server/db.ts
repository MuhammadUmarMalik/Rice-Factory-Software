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

// Lightweight migrations for new columns/tables
const productColumns = sqlite.prepare("PRAGMA table_info(products)").all();
const hasProductType = productColumns.some((c: any) => c.name === "product_type");
if (!hasProductType) {
  sqlite.exec("ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'processed';");
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS processing_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    processing_id INTEGER NOT NULL REFERENCES processing(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity TEXT NOT NULL,
    output_type TEXT NOT NULL DEFAULT 'processed',
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
`);

export const db = drizzle(sqlite, { schema });
