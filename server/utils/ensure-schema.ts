import { execSync } from "child_process";
import path from "path";
import { sqlite, resolvedDbPath } from "../models/db";

function resolveServerDir() {
  if (typeof __dirname === "string") {
    return path.resolve(__dirname, "..");
  }

  return path.resolve(process.cwd(), "server");
}

const serverDir = resolveServerDir();

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

function ensureSalesColumns(): void {
  try {
    const rows = sqlite.prepare("PRAGMA table_info(sales)").all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    if (!names.includes("payment_mode")) {
      sqlite.prepare("ALTER TABLE sales ADD COLUMN payment_mode TEXT DEFAULT 'cash'").run();
    }
    if (!names.includes("cash_receipt_id")) {
      sqlite.prepare("ALTER TABLE sales ADD COLUMN cash_receipt_id INTEGER").run();
    }
    if (!names.includes("rent_charges")) {
      sqlite.prepare("ALTER TABLE sales ADD COLUMN rent_charges TEXT DEFAULT '0'").run();
    }
    if (!names.includes("discount_amount")) {
      sqlite.prepare("ALTER TABLE sales ADD COLUMN discount_amount TEXT DEFAULT '0'").run();
    }
    if (!names.includes("due_date")) {
      sqlite.prepare("ALTER TABLE sales ADD COLUMN due_date INTEGER").run();
    }
  } catch {
    // table may not exist yet
  }

  try {
    const itemColumns = sqlite.prepare("PRAGMA table_info(sale_items)").all() as Array<{ name: string }>;
    if (!itemColumns.some((column) => column.name === "quantity_kg")) {
      sqlite.prepare("ALTER TABLE sale_items ADD COLUMN quantity_kg TEXT NOT NULL DEFAULT '0'").run();
      sqlite.prepare(`UPDATE sale_items SET quantity_kg = CAST(CAST(quantity AS REAL) * CASE LOWER(unit) WHEN 'mound' THEN 40 WHEN 'quintal' THEN 100 WHEN 'ton' THEN 1000 ELSE 1 END AS TEXT)`).run();
    }
  } catch {
    // table may not exist yet
  }
}

function ensurePurchasesColumns(): void {
  try {
    const rows = sqlite.prepare("PRAGMA table_info(purchases)").all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    if (!names.includes("payment_mode")) {
      sqlite.prepare("ALTER TABLE purchases ADD COLUMN payment_mode TEXT DEFAULT 'cash'").run();
    }
    if (!names.includes("cash_payment_id")) {
      sqlite.prepare("ALTER TABLE purchases ADD COLUMN cash_payment_id INTEGER").run();
    }
    if (!names.includes("mound_base_kg")) {
      sqlite.prepare("ALTER TABLE purchases ADD COLUMN mound_base_kg INTEGER NOT NULL DEFAULT 40").run();
    }
  } catch {
    // table may not exist yet
  }
}

function ensureProductColumns(): void {
  try {
    const rows = sqlite.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>;
    if (rows.length && !rows.some((column) => column.name === "reorder_level")) {
      sqlite.prepare("ALTER TABLE products ADD COLUMN reorder_level TEXT NOT NULL DEFAULT '10'").run();
    }
    sqlite.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_products_normalized_name ON products (LOWER(TRIM(name)))").run();
  } catch (error) {
    console.error("Unable to apply product schema safeguards:", error);
    throw error;
  }
}

function hasCashAccountsTable(): boolean {
  try {
    const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cash_accounts'").get();
    return Boolean(row);
  } catch {
    return false;
  }
}

function ensureCashAccounts(): void {
  if (!hasCashAccountsTable()) return;
  const row = sqlite.prepare("SELECT id FROM cash_accounts WHERE id = 1").get();
  if (!row) {
    sqlite.prepare("INSERT INTO cash_accounts (id, account_name, opening_balance) VALUES (1, 'Main Cash', 0)").run();
  }
}

function ensureSequencesTable(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
  `);
}

/**
 * Creates the processing_outputs table for batches that yield several products.
 *
 * Batches recorded before this table existed keep their single
 * processing.output_product_id/output_quantity pair; those legacy columns are
 * still read when a batch has no rows here, so no backfill is required.
 */
function ensureProcessingOutputsTable(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS processing_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      processing_id INTEGER NOT NULL REFERENCES processing(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity TEXT NOT NULL,
      output_type TEXT NOT NULL DEFAULT 'bio',
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_processing_outputs_processing_id ON processing_outputs(processing_id);",
  );
}

function warnOrphanedCashLinks(): void {
  try {
    const orphanReceipts = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM sales s LEFT JOIN cash_receipts cr ON cr.id = s.cash_receipt_id " +
          "WHERE s.cash_receipt_id IS NOT NULL AND cr.id IS NULL",
      )
      .get() as { n: number };
    const orphanPayments = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM purchases p LEFT JOIN cash_payments cp ON cp.id = p.cash_payment_id " +
          "WHERE p.cash_payment_id IS NOT NULL AND cp.id IS NULL",
      )
      .get() as { n: number };
    if (orphanReceipts.n > 0 || orphanPayments.n > 0) {
      console.warn(
        `Orphaned cash links found (sales.cash_receipt_id=${orphanReceipts.n}, purchases.cash_payment_id=${orphanPayments.n}). ` +
          "Reconcile or null these columns before relying on cash-link foreign keys.",
      );
    }
  } catch {
    // tables may not exist yet
  }
}

/**
 * Repairs timestamp columns that hold TEXT instead of a Unix epoch integer.
 *
 * Rows written while the schema defaulted these columns to CURRENT_TIMESTAMP
 * stored the literal "YYYY-MM-DD HH:MM:SS". Because the columns are read back
 * as `integer(..., { mode: "timestamp" })`, Drizzle evaluated `text * 1000` and
 * produced an Invalid Date, so the value reached the client as null. The schema
 * now defaults to `unixepoch()`; this converts the rows written before that.
 */
function ensureIntegerTimestamps(): void {
  try {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;

    for (const { name: table } of tables) {
      const columns = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
        name: string;
        type: string;
      }>;

      for (const column of columns) {
        if (column.type.toLowerCase() !== "integer") continue;
        // Only date-bearing columns; other integers never held CURRENT_TIMESTAMP.
        if (!/(_at|_date)$/.test(column.name)) continue;

        // `unixepoch` reads the stored literal as UTC, matching what
        // CURRENT_TIMESTAMP wrote, so the instant round-trips unchanged.
        // Values it cannot parse yield NULL and are left untouched rather than
        // being destroyed.
        sqlite
          .prepare(
            `UPDATE "${table}" SET "${column.name}" = unixepoch("${column.name}") ` +
              `WHERE typeof("${column.name}") = 'text' AND unixepoch("${column.name}") IS NOT NULL`,
          )
          .run();
      }
    }
  } catch (error) {
    console.warn("Could not normalise timestamp columns:", error);
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
  ensureSalesColumns();
  ensurePurchasesColumns();
  ensureProductColumns();
  ensureCashAccounts();
  ensureSequencesTable();
  ensureProcessingOutputsTable();
  ensureIntegerTimestamps();
  warnOrphanedCashLinks();
}
