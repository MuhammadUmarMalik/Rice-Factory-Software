import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR, "data.db")
  : path.resolve(__dirname, "..", ".local", "data.db");
const databaseUrl = process.env.DATABASE_URL || `file:${defaultDatabasePath}`;

// Drizzle Kit opens SQLite directly and does not create missing parent
// directories. Keep its behavior aligned with models/db.ts so a fresh install
// can run `npm run db:push` before the application has created `.local`.
const databasePath = databaseUrl.startsWith("file:")
  ? databaseUrl.slice("file:".length)
  : databaseUrl;
const isMemoryDatabase = databasePath === ":memory:" || databasePath.startsWith(":memory:?");
if (!isMemoryDatabase) {
  fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
}

export default defineConfig({
  out: "./migrations",
  schema: "./db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl,
  },
});
