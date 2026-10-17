import { execSync } from "child_process";
import path from "path";
import { sqlite, resolvedDbPath } from "../models/db";
import { runMigrations } from "./migrate";

function resolveServerDir() {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "server"
    ? cwd
    : path.resolve(cwd, "server");
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
  if (!columns.includes("description")) {
    sqlite.prepare("ALTER TABLE accounts ADD COLUMN description TEXT").run();
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
    if (!names.includes("freight_charges")) {
      sqlite.prepare("ALTER TABLE sales ADD COLUMN freight_charges TEXT DEFAULT '0'").run();
    }
    // Add/Less toggle per charge. Nullable so legacy rows (and the ledger
    // model's "add" fallback) keep their previous all-additive behaviour.
    for (const column of [
      "loading_charges_mode",
      "weighing_charges_mode",
      "other_charges_mode",
      "rent_charges_mode",
      "freight_charges_mode",
    ]) {
      if (!names.includes(column)) {
        sqlite.prepare(`ALTER TABLE sales ADD COLUMN ${column} TEXT`).run();
      }
    }
  } catch {
    // table may not exist yet
  }

  try {
    const itemColumns = sqlite.prepare("PRAGMA table_info(sale_items)").all() as Array<{ name: string }>;
    // Must come before the quantity_kg backfill below, which reads `unit`.
    if (!itemColumns.some((column) => column.name === "unit")) {
      sqlite.prepare(`ALTER TABLE sale_items ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'kg'`).run();
      itemColumns.push({ name: "unit" });
    }
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

/**
 * Adds the opening_balance_type column to employees and backfills existing
 * rows. The column did not exist before, so every legacy row defaults to
 * "debit" — the conventional treatment for an employee opening balance (a
 * receivable the employee owes the business, e.g. an advance). New rows set
 * the type explicitly via the employee form.
 */
function ensureEmployeeOpeningBalanceType(): void {
  try {
    const columns = sqlite.prepare("PRAGMA table_info(employees)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "opening_balance")) {
      sqlite.prepare("ALTER TABLE employees ADD COLUMN opening_balance TEXT NOT NULL DEFAULT '0'").run();
    }
    if (columns.some((column) => column.name === "opening_balance_type")) return;
    sqlite
      .prepare(
        "ALTER TABLE employees ADD COLUMN opening_balance_type TEXT NOT NULL DEFAULT 'debit'",
      )
      .run();
    // The DEFAULT applies to newly inserted rows; existing rows get the
    // default value written back to them explicitly so reads never surprise.
    sqlite.prepare("UPDATE employees SET opening_balance_type = 'debit'").run();
  } catch {
    // table may not exist yet
  }
}

/**
 * expense_entries.direction distinguishes expense outflow (debit to the
 * expense account) from other adjustments. Existing rows predate the column,
 * so they default to "debit" — the only direction the old posting logic used.
 */
function ensureExpenseEntryColumns(): void {
  try {
    const columns = sqlite.prepare("PRAGMA table_info(expense_entries)").all() as Array<{ name: string }>;
    if (columns.length === 0) return;
    if (!columns.some((column) => column.name === "direction")) {
      sqlite.prepare("ALTER TABLE expense_entries ADD COLUMN direction TEXT NOT NULL DEFAULT 'debit'").run();
    }
  } catch {
    // table may not exist yet
  }
}

function ensureCashTransactionColumns(): void {
  try {
    const columns = sqlite.prepare("PRAGMA table_info(cash_transactions)").all() as Array<{ name: string }>;
    if (columns.length === 0) return;
    if (!columns.some((column) => column.name === "cash_receipt_id")) {
      sqlite.prepare("ALTER TABLE cash_transactions ADD COLUMN cash_receipt_id INTEGER REFERENCES cash_receipts(id) ON DELETE SET NULL").run();
    }
    if (!columns.some((column) => column.name === "cash_payment_id")) {
      sqlite.prepare("ALTER TABLE cash_transactions ADD COLUMN cash_payment_id INTEGER REFERENCES cash_payments(id) ON DELETE SET NULL").run();
    }
  } catch {
    // table may not exist yet
  }
}
function ensureLedgerEntryColumns(): void {
  try {
    const columns = sqlite.prepare("PRAGMA table_info(ledger_entries)").all() as Array<{ name: string }>;
    if (columns.length === 0) return;
    if (!columns.some((column) => column.name === "cleared")) {
      sqlite.prepare("ALTER TABLE ledger_entries ADD COLUMN cleared INTEGER NOT NULL DEFAULT 0").run();
    }
  } catch {
    // table may not exist yet
  }
}

/**
 * Adds cash_receipt_id / cash_payment_id to ledger_entries so standalone
 * Cash in Hand receipts and payments can be posted to the double-entry
 * ledger. SQLite cannot ALTER a CHECK constraint, so the table is rebuilt
 * with the two new columns and the extended single-reference check.
 *
 * The check uses unqualified column names so it survives the table rename.
 */
function ensureLedgerCashReferenceColumns(): void {
  let columns: Array<{ name: string }> = [];
  try {
    columns = sqlite.prepare("PRAGMA table_info(ledger_entries)").all() as Array<{ name: string }>;
  } catch {
    return; // table may not exist yet
  }
  if (columns.length === 0) return;
  if (columns.some((column) => column.name === "cash_receipt_id")) return; // already migrated

  // Copy only the columns the current table actually has.
  const existing = new Set(columns.map((column) => column.name));
  const copied = [
    "id", "account_id", "transaction_type", "amount", "balance", "description",
    "description_urdu", "sale_id", "purchase_id", "receipt_voucher_id",
    "journal_voucher_id", "contra_voucher_id", "expense_entry_id",
    "entry_date", "cleared", "created_at",
  ].filter((column) => existing.has(column));

  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite.exec("BEGIN");
    sqlite.exec(`
      CREATE TABLE "ledger_entries_new" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "account_id" integer NOT NULL REFERENCES "accounts"("id") ON UPDATE no action ON DELETE no action,
        "transaction_type" text NOT NULL,
        "amount" text NOT NULL,
        "balance" text NOT NULL,
        "description" text NOT NULL,
        "description_urdu" text,
        "sale_id" integer REFERENCES "sales"("id") ON UPDATE no action ON DELETE no action,
        "purchase_id" integer REFERENCES "purchases"("id") ON UPDATE no action ON DELETE no action,
        "receipt_voucher_id" integer REFERENCES "receipt_vouchers"("id") ON UPDATE no action ON DELETE no action,
        "journal_voucher_id" integer REFERENCES "journal_vouchers"("id") ON UPDATE no action ON DELETE no action,
        "contra_voucher_id" integer REFERENCES "contra_vouchers"("id") ON UPDATE no action ON DELETE no action,
        "expense_entry_id" integer REFERENCES "expense_entries"("id") ON UPDATE no action ON DELETE no action,
        "cash_receipt_id" integer REFERENCES "cash_receipts"("id") ON UPDATE no action ON DELETE no action,
        "cash_payment_id" integer REFERENCES "cash_payments"("id") ON UPDATE no action ON DELETE no action,
        "entry_date" integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "cleared" INTEGER NOT NULL DEFAULT 0,
        "created_at" integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "ck_ledger_entries_single_ref" CHECK((
          (CASE WHEN "sale_id" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "purchase_id" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "receipt_voucher_id" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "journal_voucher_id" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "contra_voucher_id" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "expense_entry_id" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "cash_receipt_id" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "cash_payment_id" IS NOT NULL THEN 1 ELSE 0 END)
        ) = 1)
      );
    `);
    sqlite.exec(
      `INSERT INTO "ledger_entries_new" (${copied.map((c) => `"${c}"`).join(", ")}) ` +
      `SELECT ${copied.map((c) => `"${c}"`).join(", ")} FROM "ledger_entries";`,
    );
    sqlite.exec(`DROP TABLE "ledger_entries";`);
    sqlite.exec(`ALTER TABLE "ledger_entries_new" RENAME TO "ledger_entries";`);
    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      /* already rolled back or never began */
    }
    console.error("Could not add cash references to ledger_entries:", error);
    throw error;
  } finally {
    sqlite.pragma("foreign_keys = ON");
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

/**
 * Creates the gate_passes + gate_pass_items tables used to record physical
 * movement of goods in and out of the mill.
 *
 * This mirrors server/migrations/0001_gate_passes.sql so that every database
 * (dev, desktop, legacy installs) gets the tables on startup even when the
 * versioned migration runner cannot find its .sql files (e.g. a packaged build
 * where those files are not shipped, or a run under an ESM toolchain where
 * __dirname is unavailable).
 */
function ensureGatePassTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "gate_passes" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "number" text NOT NULL,
      "direction" text NOT NULL,
      "status" text NOT NULL DEFAULT 'ISSUED',
      "issued_at" integer NOT NULL DEFAULT (unixepoch()),
      "completed_at" integer,
      "vehicle_no" text,
      "driver_name" text,
      "driver_phone" text,
      "party_id" integer REFERENCES "accounts"("id"),
      "source_type" text,
      "source_id" integer,
      "gross_g" integer,
      "tare_g" integer,
      "net_g" integer,
      "remarks" text,
      "created_by" integer REFERENCES "users"("id"),
      "cancelled_reason" text,
      "cancelled_by" integer REFERENCES "users"("id"),
      "cancelled_at" integer,
      "fiscal_year_id" integer REFERENCES "fiscal_years"("id"),
      "created_at" integer NOT NULL DEFAULT (unixepoch()),
      "updated_at" integer NOT NULL DEFAULT (unixepoch())
    );
  `);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "gate_passes_number_unique" ON "gate_passes" ("number");`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS "idx_gate_passes_source" ON "gate_passes" ("source_type", "source_id");`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS "idx_gate_passes_vehicle" ON "gate_passes" ("vehicle_no");`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS "idx_gate_passes_issued_at" ON "gate_passes" ("issued_at");`);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "gate_pass_items" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "gate_pass_id" integer NOT NULL REFERENCES "gate_passes"("id") ON DELETE CASCADE,
      "product_id" integer NOT NULL REFERENCES "products"("id"),
      "bags" integer NOT NULL DEFAULT 0,
      "weight_g" integer NOT NULL DEFAULT 0,
      "sale_item_id" integer REFERENCES "sale_items"("id"),
      "purchase_item_id" integer REFERENCES "purchase_items"("id"),
      "created_at" integer NOT NULL DEFAULT (unixepoch())
    );
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS "idx_gate_pass_items_pass" ON "gate_pass_items" ("gate_pass_id");`);
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
    // Fall through: drizzle-kit push creates the tables but not the ones this
    // file owns (sequences, the additive columns below), so a brand new database
    // would still be missing them on first boot.
  }

  // Versioned migrations (server/migrations/*.sql) run before the additive
  // column repairs below. They are idempotent and tracked in schema_migrations,
  // and a pre-migration file backup is written the first time a pending
  // migration touches an existing database.
  runMigrations();

  ensureAccountsColumns();
  ensureSalesColumns();
  ensurePurchasesColumns();
  ensureProductColumns();
  ensureCashAccounts();
  ensureSequencesTable();
  ensureProcessingOutputsTable();
  ensureGatePassTables();
  ensureChequesTable();
  ensureEmployeeOpeningBalanceType();
  ensureExpenseEntryColumns();
  ensureLedgerEntryColumns();
  ensureLedgerCashReferenceColumns();
  ensureCashTransactionColumns();
  ensureIntegerTimestamps();
  ensureReportIndexes();
  warnOrphanedCashLinks();
}

/** Post-dated cheque register; mirrors `cheques` in db/schema.ts. */
function ensureChequesTable(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "cheques" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "direction" text NOT NULL CHECK ("direction" IN ('received', 'issued')),
      "party_id" integer REFERENCES "accounts"("id"),
      "cheque_no" text NOT NULL,
      "bank_name" text,
      "amount" text NOT NULL,
      "cheque_date" integer NOT NULL,
      "status" text NOT NULL DEFAULT 'pending'
        CHECK ("status" IN ('pending', 'deposited', 'cleared', 'bounced', 'cancelled')),
      "notes" text,
      "created_by" integer REFERENCES "users"("id"),
      "created_at" integer NOT NULL DEFAULT (unixepoch()),
      "status_changed_at" integer
    );
    CREATE INDEX IF NOT EXISTS "idx_cheques_status_date" ON "cheques" ("status", "cheque_date");
  `);
}

/**
 * Foreign-key / date indexes for ledger and report queries. Without these every
 * per-account balance and date-range report is a full table scan. Lives here
 * rather than in server/migrations because that folder is not packaged.
 */
function ensureReportIndexes() {
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_date ON ledger_entries(account_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_sale ON ledger_entries(sale_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_purchase ON ledger_entries(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON purchases(purchase_date);
    CREATE INDEX IF NOT EXISTS idx_purchases_supplier_date ON purchases(supplier_id, purchase_date);
    CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_date ON sales(customer_id, sale_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_processing_source_date ON processing(source_product_id, start_date);
    CREATE INDEX IF NOT EXISTS idx_processing_output_date ON processing(output_product_id, completed_date);
  `);
}

