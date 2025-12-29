import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const sourcePath = path.resolve(".local", "data.db");
const targetPath = path.resolve(".local", "seed.db");

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing source database at ${sourcePath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

const sqlite = new Database(targetPath);
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
} finally {
  sqlite.close();
}

console.log(`Seed database prepared at ${targetPath}`);
