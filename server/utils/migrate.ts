import fs from "fs";
import path from "path";
import { sqlite, resolvedDbPath } from "../models/db";

/**
 * Lightweight, versioned migration runner.
 *
 * The project historically relied on `drizzle-kit push` plus a pile of
 * additive `ALTER TABLE` calls in ensure-schema.ts. That works for brand new
 * databases but has two gaps the gate-pass work needed closed:
 *
 *   1. There is no record of *what* has been applied, so a change that is not
 *      a simple `ADD COLUMN` (a new table, an index, a rewrite) has no home.
 *   2. Nothing is captured before the schema changes, so a bad migration has
 *      no recovery point.
 *
 * Migrations are plain `.sql` files in server/migrations named
 * `NNNN_description.sql`. They are applied in filename order, once each,
 * inside a transaction, and their names are recorded in `schema_migrations`.
 * Before the first pending migration touches an *existing* database the whole
 * database file is copied to a timestamped sibling (`data.db.backup-<ts>`), so
 * an upgrade can always be rolled back by swapping the file back.
 *
 * Statement splitting is naive (semicolon at end of line) but sufficient for
 * the idempotent DDL these files contain; triggers/PROBLEM: statements with
 * embedded semicolons would need a smarter splitter.
 */

const MIGRATIONS_TABLE = "schema_migrations";

function resolveServerDir() {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "server"
    ? cwd
    : path.resolve(cwd, "server");
}

function resolveMigrationsDir() {
  return path.join(resolveServerDir(), "migrations");
}

function ensureMigrationsTable(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

function appliedMigrations(): Set<string> {
  const rows = sqlite.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function listMigrationFiles(): string[] {
  const dir = resolveMigrationsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

/** Splits a migration file into executable statements. */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Copies the database file (and its WAL/SHM sidecars, when present) to a
 * timestamped backup. Returns the backup path, or null when there is no
 * database file yet (fresh install — nothing to protect).
 */
export function backupDatabase(): string | null {
  if (!fs.existsSync(resolvedDbPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${resolvedDbPath}.backup-${stamp}`;
  fs.copyFileSync(resolvedDbPath, backupPath);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${resolvedDbPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.copyFileSync(sidecar, `${backupPath}${suffix}`);
    }
  }
  return backupPath;
}

/**
 * Applies every pending migration. Returns the list of migration names that
 * were applied (empty when the database was already up to date).
 *
 * @param options.backup  When false, skips the pre-migration file backup. Only
 *   used by the test harness, which points at a throwaway database.
 */
export function runMigrations(options: { backup?: boolean } = {}): string[] {
  ensureMigrationsTable();

  const done = appliedMigrations();
  const pending = listMigrationFiles().filter((name) => !done.has(name));
  if (pending.length === 0) return [];

  const shouldBackup = options.backup !== false;
  if (shouldBackup) {
    try {
      const backupPath = backupDatabase();
      if (backupPath) {
        console.log(`[migrate] Pre-migration backup written to ${backupPath}`);
      }
    } catch (error) {
      // A failed backup is fatal: applying an irreversible schema change
      // without a recovery point is worse than refusing to upgrade.
      console.error("[migrate] Could not write pre-migration backup:", error);
      throw error;
    }
  }

  const applied: string[] = [];
  for (const name of pending) {
    const file = path.join(resolveMigrationsDir(), name);
    const sql = fs.readFileSync(file, "utf8");
    const statements = splitStatements(sql);

    sqlite.exec("BEGIN");
    try {
      for (const statement of statements) {
        sqlite.exec(statement);
      }
      sqlite.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`).run(name);
      sqlite.exec("COMMIT");
      applied.push(name);
      console.log(`[migrate] Applied ${name}`);
    } catch (error) {
      try {
        sqlite.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      console.error(`[migrate] Migration ${name} failed; database left unchanged:`, error);
      throw error;
    }
  }

  return applied;
}

export function getAppliedMigrations(): string[] {
  ensureMigrationsTable();
  return Array.from(appliedMigrations()).sort();
}
