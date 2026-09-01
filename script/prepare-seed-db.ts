import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { hashPassword } from "../server/utils/auth";

const sourcePath = path.resolve(".local", "data.db");
const legacySeedPath = path.resolve(".local", "seed.db");
const targetDir = path.resolve("app-data");
const targetPath = path.join(targetDir, "data.db");

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing source database at ${sourcePath}`);
  process.exit(1);
}

if (fs.existsSync(legacySeedPath)) {
  try {
    fs.rmSync(legacySeedPath, { force: true });
  } catch {
    // Ignore cleanup failure; build can proceed.
  }
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

const sqlite = new Database(targetPath);
const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
const password = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
const fullName = process.env.DEFAULT_ADMIN_NAME || "System Admin";
const hashed = hashPassword(password);

try {
  sqlite.pragma("foreign_keys = OFF");
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name as string);

  sqlite.transaction(() => {
    for (const table of tables) {
      sqlite.prepare(`DELETE FROM "${table}"`).run();
    }
  })();

  const hasUsersTable = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (hasUsersTable) {
    sqlite
      .prepare(
        "INSERT INTO users (username, password, full_name, role, is_active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)",
      )
      .run(username, hashed, fullName, Date.now());
  } else {
    console.warn("Users table not found; admin user not created.");
  }
} finally {
  sqlite.close();
}

console.log(`Seed database prepared at ${targetPath}`);
