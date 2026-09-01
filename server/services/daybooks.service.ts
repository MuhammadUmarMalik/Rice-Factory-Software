import { sqlite } from "../models/db";
import { buildPurchaseReturnNarration, buildSalesReturnNarration } from "../utils/narration";

type ListFilters = {
  dateFrom?: string;
  dateTo?: string;
  party?: string;
  status?: string;
  minAmount?: string;
  maxAmount?: string;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

type JournalLineInput = {
  accountId?: number;
  accountName: string;
  debitAmount: string;
  creditAmount: string;
  lineDescription?: string;
  notes?: string;
};

function nowMs() {
  return Date.now();
}

function parseAmount(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Query-string paging values arrive unvalidated; a non-numeric `limit`/`offset`
// used to produce NaN and make better-sqlite3 throw (500 instead of a sane page).
function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function normalizeEpochMs(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) < 1_000_000_000_000 ? n * 1000 : n;
}

function toMs(value?: Date | string | number | null) {
  if (value == null) return null;
  if (typeof value === "number") return normalizeEpochMs(value);
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return normalizeEpochMs(value.trim());
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function toEndOfDayMs(value?: Date | string | number | null) {
  if (value == null) return null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = new Date(`${raw}T23:59:59.999`);
      return Number.isFinite(d.getTime()) ? d.getTime() : null;
    }
  }
  const ms = toMs(value);
  if (!ms) return ms;
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function columnExists(tableName: string, columnName: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    return cols.some((c) => c.name === columnName);
  } catch {
    return false;
  }
}

function addColumnIfMissing(tableName: string, columnName: string, ddlType: string) {
  if (!tableExists(tableName)) return;
  if (columnExists(tableName, columnName)) return;
  try {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddlType}`);
  } catch (error) {
    console.error(`Failed to add ${tableName}.${columnName}`, error);
  }
}

function tableExists(tableName: string) {
  try {
    const row = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
      .get(tableName) as any;
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

function safePrepare(sql: string) {
  try {
    return sqlite.prepare(sql);
  } catch {
    return null;
  }
}

function assertNotFutureDate(value?: Date | string | number | null, label = "Date") {
  if (value == null) return;
  const ms = toMs(value);
  if (!ms) return;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const check = new Date(ms);
  const checkStart = new Date(check.getFullYear(), check.getMonth(), check.getDate()).getTime();
  if (checkStart > todayStart) throw new Error(`${label} cannot be in the future`);
}

function sumLines(lines: JournalLineInput[]) {
  return lines.reduce(
    (acc, line) => {
      acc.debit += parseAmount(line.debitAmount);
      acc.credit += parseAmount(line.creditAmount);
      return acc;
    },
    { debit: 0, credit: 0 },
  );
}

/**
 * Pagination is opt-in. The sales/purchases daybooks previously defaulted to
 * `LIMIT 100`, so any period with more than 100 invoices was silently truncated
 * — the on-screen "Total:" row, the print document and the CSV export all
 * reported the first 100 rows only, with no indication that anything was
 * missing. Every other daybook list already returns the full set, so this
 * matches them: a limit is applied only when the caller explicitly asks for one.
 */
function pageClause(filters: ListFilters) {
  if (filters.limit == null || filters.limit === ("" as any)) return "";
  const limit = clampInt(filters.limit, 100, 1, 500);
  const offset = clampInt(filters.offset ?? 0, 0, 0, Number.MAX_SAFE_INTEGER);
  return ` LIMIT ${limit} OFFSET ${offset}`;
}

function safeSort(sortBy: string | undefined, fallback: string, allowed: string[]) {
  if (!sortBy) return fallback;
  return allowed.includes(sortBy) ? sortBy : fallback;
}

function buildCommonFilters(filters: ListFilters, partyColumn: string, amountColumn: string, dateColumn: string) {
  const where: string[] = ["is_deleted = 0"];
  const params: any[] = [];
  if (filters.dateFrom) {
    where.push(`${dateColumn} >= ?`);
    params.push(toMs(filters.dateFrom));
  }
  if (filters.dateTo) {
    where.push(`${dateColumn} <= ?`);
    params.push(toEndOfDayMs(filters.dateTo));
  }
  if (filters.party) {
    where.push(`${partyColumn} LIKE ?`);
    params.push(`%${filters.party}%`);
  }
  if (filters.status) {
    where.push(`status = ?`);
    params.push(filters.status);
  }
  if (filters.minAmount != null && filters.minAmount !== "") {
    where.push(`CAST(${amountColumn} AS REAL) >= ?`);
    params.push(parseAmount(filters.minAmount));
  }
  if (filters.maxAmount != null && filters.maxAmount !== "") {
    where.push(`CAST(${amountColumn} AS REAL) <= ?`);
    params.push(parseAmount(filters.maxAmount));
  }
  if (filters.search) {
    where.push(`(COALESCE(description, '') LIKE ? OR COALESCE(notes, '') LIKE ?)`);
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  return { whereSql: where.join(" AND "), params };
}

function insertAuditLog(daybookType: string, recordId: number, action: string, beforeJson: any, afterJson: any, userId?: number) {
  sqlite
    .prepare(
      `INSERT INTO daybook_audit_logs(daybook_type, record_id, action, before_json, after_json, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      daybookType,
      recordId,
      action,
      beforeJson ? JSON.stringify(beforeJson) : null,
      afterJson ? JSON.stringify(afterJson) : null,
      userId ?? null,
      nowMs(),
    );
}

function ensureTables() {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS sales_daybook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_account_details TEXT,
  description TEXT,
  quantity TEXT NOT NULL DEFAULT '0',
  unit_price TEXT NOT NULL DEFAULT '0',
  subtotal_amount TEXT NOT NULL DEFAULT '0',
  tax_amount TEXT NOT NULL DEFAULT '0',
  total_amount TEXT NOT NULL DEFAULT '0',
  payment_terms TEXT,
  due_date INTEGER,
  paid_amount TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  migration_date INTEGER
);
CREATE TABLE IF NOT EXISTS purchases_daybook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  supplier_id INTEGER,
  supplier_name TEXT NOT NULL,
  supplier_account_details TEXT,
  description TEXT,
  quantity TEXT NOT NULL DEFAULT '0',
  unit_price TEXT NOT NULL DEFAULT '0',
  subtotal_amount TEXT NOT NULL DEFAULT '0',
  tax_amount TEXT NOT NULL DEFAULT '0',
  total_amount TEXT NOT NULL DEFAULT '0',
  payment_terms TEXT,
  due_date INTEGER,
  paid_amount TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  migration_date INTEGER
);
CREATE TABLE IF NOT EXISTS cash_book (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  account_type TEXT NOT NULL,
  bank_account_id INTEGER,
  bank_account_name TEXT,
  reference_number TEXT,
  party_name TEXT,
  description TEXT,
  amount TEXT NOT NULL DEFAULT '0',
  category TEXT,
  notes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  migration_date INTEGER
);
CREATE TABLE IF NOT EXISTS sales_returns_daybook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_date INTEGER NOT NULL,
  credit_note_number TEXT NOT NULL,
  original_invoice_reference TEXT,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  description TEXT,
  quantity_returned TEXT NOT NULL DEFAULT '0',
  reason TEXT,
  return_amount TEXT NOT NULL DEFAULT '0',
  tax_adjustment TEXT NOT NULL DEFAULT '0',
  total_credit_amount TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  migration_date INTEGER
);
CREATE TABLE IF NOT EXISTS purchase_returns_daybook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_date INTEGER NOT NULL,
  debit_note_number TEXT NOT NULL,
  original_purchase_reference TEXT,
  supplier_id INTEGER,
  supplier_name TEXT NOT NULL,
  description TEXT,
  quantity_returned TEXT NOT NULL DEFAULT '0',
  reason TEXT,
  return_amount TEXT NOT NULL DEFAULT '0',
  tax_adjustment TEXT NOT NULL DEFAULT '0',
  total_debit_amount TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  migration_date INTEGER
);
CREATE TABLE IF NOT EXISTS general_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_date INTEGER NOT NULL,
  journal_entry_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  entry_type TEXT,
  total_debits TEXT NOT NULL DEFAULT '0',
  total_credits TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'Draft',
  approved_by INTEGER,
  attachment_paths TEXT,
  notes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  migration_date INTEGER
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL,
  account_id INTEGER,
  account_name TEXT NOT NULL,
  debit_amount TEXT NOT NULL DEFAULT '0',
  credit_amount TEXT NOT NULL DEFAULT '0',
  line_description TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (journal_id) REFERENCES general_journal(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS daybook_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daybook_type TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  changed_by INTEGER,
  changed_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_sales_daybook_date ON sales_daybook(transaction_date);
CREATE INDEX IF NOT EXISTS idx_sales_daybook_customer ON sales_daybook(customer_name);
CREATE INDEX IF NOT EXISTS idx_purchases_daybook_date ON purchases_daybook(transaction_date);
CREATE INDEX IF NOT EXISTS idx_purchases_daybook_supplier ON purchases_daybook(supplier_name);
CREATE INDEX IF NOT EXISTS idx_cash_book_date ON cash_book(transaction_date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns_daybook(return_date);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns_daybook(return_date);
CREATE INDEX IF NOT EXISTS idx_general_journal_date ON general_journal(transaction_date);
CREATE INDEX IF NOT EXISTS idx_daybook_audit ON daybook_audit_logs(daybook_type, record_id, changed_at);
`);
}

ensureTables();

function normalizeLegacyEpochColumns() {
  const updates = [
    `UPDATE sales_daybook SET transaction_date = transaction_date * 1000 WHERE transaction_date > 0 AND transaction_date < 1000000000000`,
    `UPDATE sales_daybook SET due_date = due_date * 1000 WHERE due_date > 0 AND due_date < 1000000000000`,
    `UPDATE purchases_daybook SET transaction_date = transaction_date * 1000 WHERE transaction_date > 0 AND transaction_date < 1000000000000`,
    `UPDATE purchases_daybook SET due_date = due_date * 1000 WHERE due_date > 0 AND due_date < 1000000000000`,
    `UPDATE cash_book SET transaction_date = transaction_date * 1000 WHERE transaction_date > 0 AND transaction_date < 1000000000000`,
    `UPDATE sales_returns_daybook SET return_date = return_date * 1000 WHERE return_date > 0 AND return_date < 1000000000000`,
    `UPDATE purchase_returns_daybook SET return_date = return_date * 1000 WHERE return_date > 0 AND return_date < 1000000000000`,
    `UPDATE general_journal SET transaction_date = transaction_date * 1000 WHERE transaction_date > 0 AND transaction_date < 1000000000000`,
    `UPDATE daybook_audit_logs SET changed_at = changed_at * 1000 WHERE changed_at > 0 AND changed_at < 1000000000000`,
  ];
  for (const statement of updates) {
    sqlite.prepare(statement).run();
  }
}

normalizeLegacyEpochColumns();

let autoMigrationAttempted = false;

function dedupeCashBookRows() {
  try {
    // Keep earliest row for same migrated reference; soft-delete later duplicates.
    sqlite.exec(`
      UPDATE cash_book
      SET
        is_deleted = 1,
        updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
      WHERE is_deleted = 0
        AND COALESCE(reference_number, '') <> ''
        AND EXISTS (
          SELECT 1
          FROM cash_book older
          WHERE older.is_deleted = 0
            AND older.id < cash_book.id
            AND COALESCE(older.reference_number, '') = COALESCE(cash_book.reference_number, '')
            AND COALESCE(older.transaction_type, '') = COALESCE(cash_book.transaction_type, '')
            AND COALESCE(older.account_type, '') = COALESCE(cash_book.account_type, '')
            AND COALESCE(older.amount, '') = COALESCE(cash_book.amount, '')
        );
    `);
  } catch (error) {
    console.error("Cash book deduplication failed", error);
  }
}

dedupeCashBookRows();

/**
 * The daybook tables are a denormalized *projection* of the transactional
 * tables (sales, purchases, ...), not an independent ledger. They used to be
 * populated by a single "seed if empty" migration which:
 *   - never wrote the sale_id / purchase_id link column, so rows could not be
 *     matched back to their source;
 *   - never ran again once any daybook row existed, so sales created after the
 *     first seed never appeared in the Sales Daybook at all;
 *   - never updated or removed a row when the underlying invoice was edited or
 *     deleted, leaving stale rows reporting superseded amounts.
 *
 * Reconciliation below replaces that. Every read syncs the projection against
 * its source: insert missing, update changed, soft-delete orphaned. Rows with a
 * NULL source id are hand-entered daybook records and are never touched.
 */
function ensureDaybookLinkColumns() {
  addColumnIfMissing("sales_daybook", "sale_id", "INTEGER");
  addColumnIfMissing("purchases_daybook", "purchase_id", "INTEGER");

  // Pre-existing migrated rows have no link id — recover it from the invoice
  // number, which the old migration did copy across verbatim.
  try {
    if (tableExists("sales")) {
      sqlite.exec(`
        UPDATE sales_daybook
        SET sale_id = (SELECT s.id FROM sales s WHERE s.invoice_number = sales_daybook.invoice_number)
        WHERE sale_id IS NULL
          AND EXISTS (SELECT 1 FROM sales s WHERE s.invoice_number = sales_daybook.invoice_number)
      `);
    }
    if (tableExists("purchases")) {
      sqlite.exec(`
        UPDATE purchases_daybook
        SET purchase_id = (SELECT p.id FROM purchases p WHERE p.invoice_number = purchases_daybook.invoice_number)
        WHERE purchase_id IS NULL
          AND EXISTS (SELECT 1 FROM purchases p WHERE p.invoice_number = purchases_daybook.invoice_number)
      `);
    }
  } catch (error) {
    console.error("Daybook link backfill failed", error);
  }
}

ensureDaybookLinkColumns();

function paymentStatus(total: unknown, paid: unknown) {
  const t = parseAmount(total as any);
  const p = parseAmount(paid as any);
  if (p <= 0) return "Pending";
  return p >= t ? "Fully Paid" : "Partially Paid";
}

function syncSalesDaybook(): number {
  if (!tableExists("sales")) return 0;
  const rows = sqlite
    .prepare(`SELECT s.*, a.name as customer_name FROM sales s LEFT JOIN accounts a ON a.id = s.customer_id`)
    .all() as any[];
  const liveIds = new Set<number>();

  const upsert = sqlite.transaction(() => {
    for (const row of rows) {
      liveIds.add(Number(row.id));
      const values = {
        sale_id: Number(row.id),
        transaction_date: toMs(row.sale_date),
        invoice_number: row.invoice_number,
        customer_id: row.customer_id ?? null,
        customer_name: row.customer_name || "Unknown Customer",
        description: row.notes ?? null,
        quantity: "1",
        unit_price: row.subtotal || "0",
        subtotal_amount: row.subtotal || "0",
        tax_amount: row.tax_amount || "0",
        total_amount: row.total_amount || "0",
        due_date: toMs(row.due_date ?? null),
        paid_amount: row.paid_amount || "0",
        status: paymentStatus(row.total_amount, row.paid_amount),
        notes: row.notes ?? null,
      };
      const existing = sqlite.prepare(`SELECT * FROM sales_daybook WHERE sale_id = ?`).get(row.id) as any;
      if (existing) {
        sqlite
          .prepare(
            `UPDATE sales_daybook SET transaction_date=?, invoice_number=?, customer_id=?, customer_name=?,
               description=?, quantity=?, unit_price=?, subtotal_amount=?, tax_amount=?, total_amount=?,
               due_date=?, paid_amount=?, status=?, notes=?, is_deleted=0, updated_at=?
             WHERE id=?`,
          )
          .run(
            values.transaction_date, values.invoice_number, values.customer_id, values.customer_name,
            values.description, values.quantity, values.unit_price, values.subtotal_amount, values.tax_amount,
            values.total_amount, values.due_date, values.paid_amount, values.status, values.notes, nowMs(),
            existing.id,
          );
      } else {
        sqlite
          .prepare(
            `INSERT INTO sales_daybook(
               sale_id, transaction_date, invoice_number, customer_id, customer_name, description, quantity,
               unit_price, subtotal_amount, tax_amount, total_amount, payment_terms, due_date, paid_amount,
               status, notes, created_by, created_at, updated_at, is_deleted
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Net 30', ?, ?, ?, ?, ?, ?, ?, 0)`,
          )
          .run(
            values.sale_id, values.transaction_date, values.invoice_number, values.customer_id, values.customer_name,
            values.description, values.quantity, values.unit_price, values.subtotal_amount, values.tax_amount,
            values.total_amount, values.due_date, values.paid_amount, values.status, values.notes,
            row.created_by ?? null, nowMs(), nowMs(),
          );
      }
    }

    // Source invoice deleted → retire its projection instead of leaving a
    // phantom row that inflates Sales Daybook totals.
    const orphans = sqlite
      .prepare(`SELECT id, sale_id FROM sales_daybook WHERE sale_id IS NOT NULL AND is_deleted = 0`)
      .all() as any[];
    for (const o of orphans) {
      if (!liveIds.has(Number(o.sale_id))) {
        sqlite.prepare(`UPDATE sales_daybook SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(nowMs(), o.id);
      }
    }
  });
  upsert();
  return rows.length;
}

/** Bags where the purchase is bagged, otherwise net kg; never zero. */
function purchaseQuantity(row: any) {
  const bags = parseAmount(row.total_bags);
  if (bags > 0) return bags;
  const netKg = parseAmount(row.total_net_weight_kg);
  if (netKg > 0) return netKg;
  return 1;
}

function syncPurchasesDaybook(): number {
  if (!tableExists("purchases")) return 0;
  const deletedAware = columnExists("purchases", "deleted_at");
  const rows = sqlite
    .prepare(
      `SELECT p.*, a.name as supplier_name FROM purchases p LEFT JOIN accounts a ON a.id = p.supplier_id
       ${deletedAware ? "WHERE p.deleted_at IS NULL" : ""}`,
    )
    .all() as any[];
  const liveIds = new Set<number>();

  const upsert = sqlite.transaction(() => {
    for (const row of rows) {
      liveIds.add(Number(row.id));
      // Bags are only populated for bag-based purchases; weight-based ones carry
      // their quantity in net kg. Taking `total_bags` verbatim wrote quantity 0
      // against a non-zero subtotal, so the exported quantity x unit price did
      // not reconstruct the line value.
      const quantity = purchaseQuantity(row);
      const subtotal = parseAmount(row.subtotal);
      const values = {
        transaction_date: toMs(row.purchase_date),
        invoice_number: row.invoice_number,
        supplier_id: row.supplier_id ?? null,
        supplier_name: row.supplier_name || "Unknown Supplier",
        description: row.notes ?? null,
        quantity: String(quantity),
        unit_price: String(subtotal / quantity),
        subtotal_amount: row.subtotal || "0",
        tax_amount: row.tax_amount || "0",
        total_amount: row.total_amount || "0",
        due_date: toMs(row.due_date ?? null),
        paid_amount: row.paid_amount || "0",
        status: paymentStatus(row.total_amount, row.paid_amount),
        notes: row.notes ?? null,
      };
      const existing = sqlite.prepare(`SELECT * FROM purchases_daybook WHERE purchase_id = ?`).get(row.id) as any;
      if (existing) {
        sqlite
          .prepare(
            `UPDATE purchases_daybook SET transaction_date=?, invoice_number=?, supplier_id=?, supplier_name=?,
               description=?, quantity=?, unit_price=?, subtotal_amount=?, tax_amount=?, total_amount=?,
               due_date=?, paid_amount=?, status=?, notes=?, is_deleted=0, updated_at=?
             WHERE id=?`,
          )
          .run(
            values.transaction_date, values.invoice_number, values.supplier_id, values.supplier_name,
            values.description, values.quantity, values.unit_price, values.subtotal_amount, values.tax_amount,
            values.total_amount, values.due_date, values.paid_amount, values.status, values.notes, nowMs(),
            existing.id,
          );
      } else {
        sqlite
          .prepare(
            `INSERT INTO purchases_daybook(
               purchase_id, transaction_date, invoice_number, supplier_id, supplier_name, description, quantity,
               unit_price, subtotal_amount, tax_amount, total_amount, payment_terms, due_date, paid_amount,
               status, notes, created_by, created_at, updated_at, is_deleted
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Net 30', ?, ?, ?, ?, ?, ?, ?, 0)`,
          )
          .run(
            Number(row.id), values.transaction_date, values.invoice_number, values.supplier_id, values.supplier_name,
            values.description, values.quantity, values.unit_price, values.subtotal_amount, values.tax_amount,
            values.total_amount, values.due_date, values.paid_amount, values.status, values.notes,
            row.created_by ?? null, nowMs(), nowMs(),
          );
      }
    }

    const orphans = sqlite
      .prepare(`SELECT id, purchase_id FROM purchases_daybook WHERE purchase_id IS NOT NULL AND is_deleted = 0`)
      .all() as any[];
    for (const o of orphans) {
      if (!liveIds.has(Number(o.purchase_id))) {
        sqlite.prepare(`UPDATE purchases_daybook SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(nowMs(), o.id);
      }
    }
  });
  upsert();
  return rows.length;
}

function ensureDaybookSeededFromLegacy() {
  try {
    syncSalesDaybook();
    syncPurchasesDaybook();
  } catch (error) {
    console.error("Daybook sync failed", error);
  }

  // The remaining projections (cash book, journals, returns) still rely on the
  // one-shot legacy seed; only run it while they are completely empty.
  if (autoMigrationAttempted) return;
  autoMigrationAttempted = true;
  try {
    const remainingTotal = Number(
      (
        sqlite
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM cash_book) +
               (SELECT COUNT(*) FROM sales_returns_daybook) +
               (SELECT COUNT(*) FROM purchase_returns_daybook) +
               (SELECT COUNT(*) FROM general_journal) AS c`,
          )
          .get() as any
      )?.c ?? 0,
    );
    if (remainingTotal > 0) return;

    const countIfExists = (tableName: string) => {
      if (!tableExists(tableName)) return 0;
      try {
        const row = sqlite.prepare(`SELECT COUNT(*) as c FROM ${tableName}`).get() as any;
        return Number(row?.c ?? 0);
      } catch {
        return 0;
      }
    };

    const legacyTotal = countIfExists("cash_transactions") + countIfExists("journal_vouchers");
    if (legacyTotal === 0) return;

    migrateLegacyDayBook(new Date());
  } catch (error) {
    console.error("Daybook auto-migration failed", error);
  }
}

function findOne(table: string, id: number) {
  return sqlite.prepare(`SELECT * FROM ${table} WHERE id = ? AND is_deleted = 0`).get(id) as any;
}

function softDelete(table: string, id: number, userId?: number) {
  const existing = findOne(table, id);
  if (!existing) return false;
  sqlite.prepare(`UPDATE ${table} SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?`).run(userId ?? null, nowMs(), id);
  insertAuditLog(table, id, "delete", existing, null, userId);
  return true;
}

export function listSalesDaybook(filters: ListFilters = {}) {
  ensureDaybookSeededFromLegacy();
  const sortBy = safeSort(filters.sortBy, "transaction_date", ["transaction_date", "invoice_number", "customer_name", "total_amount", "status", "created_at"]);
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const { whereSql, params } = buildCommonFilters(filters, "customer_name", "total_amount", "transaction_date");
  return sqlite
    .prepare(`SELECT * FROM sales_daybook WHERE ${whereSql} ORDER BY ${sortBy} ${sortDir}, id DESC${pageClause(filters)}`)
    .all(...params);
}

export function getSalesDaybook(id: number) {
  return findOne("sales_daybook", id);
}

export function createSalesDaybook(input: any, userId?: number) {
  assertNotFutureDate(input.transactionDate, "Transaction date");
  const dup = sqlite.prepare(`SELECT id FROM sales_daybook WHERE invoice_number = ? AND is_deleted = 0`).get(input.invoiceNumber) as any;
  if (dup) throw new Error("Duplicate invoice number");
  const now = nowMs();
  const result = sqlite
    .prepare(
      `INSERT INTO sales_daybook(
        transaction_date, invoice_number, customer_id, customer_name, customer_account_details, description,
        quantity, unit_price, subtotal_amount, tax_amount, total_amount, payment_terms, due_date, paid_amount, status,
        notes, created_by, updated_by, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      toMs(input.transactionDate),
      input.invoiceNumber,
      input.customerId ?? null,
      input.customerName,
      input.customerAccountDetails ?? null,
      input.description ?? null,
      input.quantity,
      input.unitPrice,
      input.subtotalAmount,
      input.taxAmount ?? "0",
      input.totalAmount,
      input.paymentTerms ?? null,
      toMs(input.dueDate),
      input.paidAmount ?? "0",
      input.status ?? "Pending",
      input.notes ?? null,
      userId ?? null,
      userId ?? null,
      now,
      now,
    );
  const row = getSalesDaybook(Number(result.lastInsertRowid));
  insertAuditLog("sales_daybook", Number(result.lastInsertRowid), "create", null, row, userId);
  return row;
}

export function updateSalesDaybook(id: number, input: any, userId?: number) {
  const existing = getSalesDaybook(id);
  if (!existing) return undefined;
  assertNotFutureDate(input.transactionDate ?? existing.transaction_date, "Transaction date");
  if (input.invoiceNumber && input.invoiceNumber !== existing.invoice_number) {
    const dup = sqlite
      .prepare(`SELECT id FROM sales_daybook WHERE invoice_number = ? AND is_deleted = 0 AND id != ?`)
      .get(input.invoiceNumber, id) as any;
    if (dup) throw new Error("Duplicate invoice number");
  }
  sqlite
    .prepare(
      `UPDATE sales_daybook SET
        transaction_date = ?, invoice_number = ?, customer_id = ?, customer_name = ?, customer_account_details = ?, description = ?,
        quantity = ?, unit_price = ?, subtotal_amount = ?, tax_amount = ?, total_amount = ?, payment_terms = ?,
        due_date = ?, paid_amount = ?, status = ?, notes = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      toMs(input.transactionDate ?? existing.transaction_date),
      input.invoiceNumber ?? existing.invoice_number,
      input.customerId ?? existing.customer_id ?? null,
      input.customerName ?? existing.customer_name,
      input.customerAccountDetails ?? existing.customer_account_details ?? null,
      input.description ?? existing.description ?? null,
      input.quantity ?? existing.quantity,
      input.unitPrice ?? existing.unit_price,
      input.subtotalAmount ?? existing.subtotal_amount,
      input.taxAmount ?? existing.tax_amount,
      input.totalAmount ?? existing.total_amount,
      input.paymentTerms ?? existing.payment_terms ?? null,
      toMs(input.dueDate ?? existing.due_date),
      input.paidAmount ?? existing.paid_amount,
      input.status ?? existing.status,
      input.notes ?? existing.notes ?? null,
      userId ?? null,
      nowMs(),
      id,
    );
  const updated = getSalesDaybook(id);
  insertAuditLog("sales_daybook", id, "update", existing, updated, userId);
  return updated;
}

export function deleteSalesDaybook(id: number, userId?: number) {
  return softDelete("sales_daybook", id, userId);
}

export function getSalesCustomerSummary(filters: ListFilters = {}) {
  ensureDaybookSeededFromLegacy();
  const { whereSql, params } = buildCommonFilters(filters, "customer_name", "total_amount", "transaction_date");
  return sqlite
    .prepare(
      `SELECT customer_name as customerName, COUNT(*) as invoices, SUM(CAST(total_amount AS REAL)) as totalSales,
              SUM(CAST(paid_amount AS REAL)) as paid, SUM(CAST(total_amount AS REAL) - CAST(paid_amount AS REAL)) as outstanding
       FROM sales_daybook
       WHERE ${whereSql}
       GROUP BY customer_name
       ORDER BY totalSales DESC`,
    )
    .all(...params);
}

export function getSalesAging(asOfDate?: string | Date) {
  const asOf = toMs(asOfDate ?? new Date()) ?? nowMs();
  const rows = sqlite
    .prepare(
      `SELECT customer_name as customerName, invoice_number as invoiceNumber, transaction_date as transactionDate, due_date as dueDate,
              total_amount as totalAmount, paid_amount as paidAmount
       FROM sales_daybook
       WHERE is_deleted = 0 AND status != 'Fully Paid'`,
    )
    .all() as any[];
  return rows.map((row) => {
    const due = Number(row.dueDate ?? row.transactionDate ?? asOf);
    const ageDays = Math.max(0, Math.floor((asOf - due) / 86400000));
    const outstanding = parseAmount(row.totalAmount) - parseAmount(row.paidAmount);
    const bucket = ageDays <= 30 ? "0-30" : ageDays <= 60 ? "31-60" : ageDays <= 90 ? "61-90" : "90+";
    return { ...row, ageDays, outstanding: outstanding.toFixed(2), bucket };
  });
}

export function listPurchasesDaybook(filters: ListFilters = {}) {
  ensureDaybookSeededFromLegacy();
  const sortBy = safeSort(filters.sortBy, "transaction_date", ["transaction_date", "invoice_number", "supplier_name", "total_amount", "status", "created_at"]);
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const { whereSql, params } = buildCommonFilters(filters, "supplier_name", "total_amount", "transaction_date");
  return sqlite
    .prepare(`SELECT * FROM purchases_daybook WHERE ${whereSql} ORDER BY ${sortBy} ${sortDir}, id DESC${pageClause(filters)}`)
    .all(...params);
}

export function getPurchasesDaybook(id: number) {
  return findOne("purchases_daybook", id);
}

export function createPurchasesDaybook(input: any, userId?: number) {
  assertNotFutureDate(input.transactionDate, "Transaction date");
  const dup = sqlite.prepare(`SELECT id FROM purchases_daybook WHERE invoice_number = ? AND is_deleted = 0`).get(input.invoiceNumber) as any;
  if (dup) throw new Error("Duplicate invoice number");
  const now = nowMs();
  const result = sqlite
    .prepare(
      `INSERT INTO purchases_daybook(
        transaction_date, invoice_number, supplier_id, supplier_name, supplier_account_details, description,
        quantity, unit_price, subtotal_amount, tax_amount, total_amount, payment_terms, due_date, paid_amount, status,
        notes, created_by, updated_by, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      toMs(input.transactionDate),
      input.invoiceNumber,
      input.supplierId ?? null,
      input.supplierName,
      input.supplierAccountDetails ?? null,
      input.description ?? null,
      input.quantity,
      input.unitPrice,
      input.subtotalAmount,
      input.taxAmount ?? "0",
      input.totalAmount,
      input.paymentTerms ?? null,
      toMs(input.dueDate),
      input.paidAmount ?? "0",
      input.status ?? "Pending",
      input.notes ?? null,
      userId ?? null,
      userId ?? null,
      now,
      now,
    );
  const row = getPurchasesDaybook(Number(result.lastInsertRowid));
  insertAuditLog("purchases_daybook", Number(result.lastInsertRowid), "create", null, row, userId);
  return row;
}

export function updatePurchasesDaybook(id: number, input: any, userId?: number) {
  const existing = getPurchasesDaybook(id);
  if (!existing) return undefined;
  assertNotFutureDate(input.transactionDate ?? existing.transaction_date, "Transaction date");
  if (input.invoiceNumber && input.invoiceNumber !== existing.invoice_number) {
    const dup = sqlite
      .prepare(`SELECT id FROM purchases_daybook WHERE invoice_number = ? AND is_deleted = 0 AND id != ?`)
      .get(input.invoiceNumber, id) as any;
    if (dup) throw new Error("Duplicate invoice number");
  }
  sqlite
    .prepare(
      `UPDATE purchases_daybook SET
        transaction_date = ?, invoice_number = ?, supplier_id = ?, supplier_name = ?, supplier_account_details = ?, description = ?,
        quantity = ?, unit_price = ?, subtotal_amount = ?, tax_amount = ?, total_amount = ?, payment_terms = ?,
        due_date = ?, paid_amount = ?, status = ?, notes = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      toMs(input.transactionDate ?? existing.transaction_date),
      input.invoiceNumber ?? existing.invoice_number,
      input.supplierId ?? existing.supplier_id ?? null,
      input.supplierName ?? existing.supplier_name,
      input.supplierAccountDetails ?? existing.supplier_account_details ?? null,
      input.description ?? existing.description ?? null,
      input.quantity ?? existing.quantity,
      input.unitPrice ?? existing.unit_price,
      input.subtotalAmount ?? existing.subtotal_amount,
      input.taxAmount ?? existing.tax_amount,
      input.totalAmount ?? existing.total_amount,
      input.paymentTerms ?? existing.payment_terms ?? null,
      toMs(input.dueDate ?? existing.due_date),
      input.paidAmount ?? existing.paid_amount,
      input.status ?? existing.status,
      input.notes ?? existing.notes ?? null,
      userId ?? null,
      nowMs(),
      id,
    );
  const updated = getPurchasesDaybook(id);
  insertAuditLog("purchases_daybook", id, "update", existing, updated, userId);
  return updated;
}

export function deletePurchasesDaybook(id: number, userId?: number) {
  return softDelete("purchases_daybook", id, userId);
}

export function getPurchasesSupplierSummary(filters: ListFilters = {}) {
  ensureDaybookSeededFromLegacy();
  const { whereSql, params } = buildCommonFilters(filters, "supplier_name", "total_amount", "transaction_date");
  return sqlite
    .prepare(
      `SELECT supplier_name as supplierName, COUNT(*) as invoices, SUM(CAST(total_amount AS REAL)) as totalPurchases,
              SUM(CAST(paid_amount AS REAL)) as paid, SUM(CAST(total_amount AS REAL) - CAST(paid_amount AS REAL)) as outstanding
       FROM purchases_daybook
       WHERE ${whereSql}
       GROUP BY supplier_name
       ORDER BY totalPurchases DESC`,
    )
    .all(...params);
}

export function getOutstandingPayables(filters: ListFilters = {}) {
  // Without this the payables list is served straight off a projection that may
  // predate the latest purchase/payment, so it disagreed with the Purchases
  // Daybook and the supplier ledger.
  ensureDaybookSeededFromLegacy();
  const { whereSql, params } = buildCommonFilters(filters, "supplier_name", "total_amount", "transaction_date");
  return sqlite
    .prepare(
      `SELECT id, supplier_name as supplierName, invoice_number as invoiceNumber, due_date as dueDate, total_amount as totalAmount,
              paid_amount as paidAmount, (CAST(total_amount AS REAL) - CAST(paid_amount AS REAL)) as outstanding
       FROM purchases_daybook
       WHERE ${whereSql} AND status != 'Fully Paid'
       ORDER BY due_date ASC, id ASC`,
    )
    .all(...params);
}

export function listCashBook(filters: ListFilters = {}) {
  ensureDaybookSeededFromLegacy();
  dedupeCashBookRows();
  const where: string[] = ["is_deleted = 0"];
  const params: any[] = [];
  if (filters.dateFrom) {
    where.push("transaction_date >= ?");
    params.push(toMs(filters.dateFrom));
  }
  if (filters.dateTo) {
    where.push("transaction_date <= ?");
    params.push(toEndOfDayMs(filters.dateTo));
  }
  if (filters.status) {
    where.push("transaction_type = ?");
    params.push(filters.status);
  }
  if (filters.party) {
    where.push("COALESCE(party_name, '') LIKE ?");
    params.push(`%${filters.party}%`);
  }
  if (filters.search) {
    where.push("(COALESCE(description, '') LIKE ? OR COALESCE(category, '') LIKE ? OR COALESCE(reference_number, '') LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.minAmount != null && filters.minAmount !== "") {
    where.push("CAST(amount AS REAL) >= ?");
    params.push(parseAmount(filters.minAmount));
  }
  if (filters.maxAmount != null && filters.maxAmount !== "") {
    where.push("CAST(amount AS REAL) <= ?");
    params.push(parseAmount(filters.maxAmount));
  }
  const sortBy = safeSort(filters.sortBy, "transaction_date", ["transaction_date", "transaction_type", "account_type", "party_name", "amount", "category", "created_at"]);
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const rows = sqlite
    .prepare(`SELECT * FROM cash_book WHERE ${where.join(" AND ")} ORDER BY ${sortBy} ${sortDir}, id DESC`)
    .all(...params) as any[];

  const salePartyById = tableExists("sales") ? safePrepare(
    `SELECT COALESCE(a.name, '') as party
     FROM sales s
     LEFT JOIN accounts a ON a.id = s.customer_id
     WHERE s.id = ?`,
  ) : null;
  const purchasePartyById = tableExists("purchases") ? safePrepare(
    `SELECT COALESCE(a.name, '') as party
     FROM purchases p
     LEFT JOIN accounts a ON a.id = p.supplier_id
     WHERE p.id = ?`,
  ) : null;
  const receiptPartyById = tableExists("receipt_voucher_lines") ? safePrepare(
    `SELECT COALESCE(a.name, '') as party
     FROM receipt_voucher_lines l
     LEFT JOIN accounts a ON a.id = l.account_id
     WHERE l.voucher_id = ?
       AND (a.type IS NULL OR a.type NOT IN ('bank', 'asset'))
     ORDER BY l.id ASC
     LIMIT 1`,
  ) : null;
  const allocatedReceiptPartyById = tableExists("invoice_allocations") && tableExists("sales") ? safePrepare(
    `SELECT COALESCE(a.name, '') as party
     FROM invoice_allocations ia
     JOIN sales s ON s.id = ia.invoice_id
     LEFT JOIN accounts a ON a.id = s.customer_id
     WHERE ia.voucher_type = 'receipt' AND ia.voucher_id = ?
     ORDER BY ia.id DESC
     LIMIT 1`,
  ) : null;
  const allocatedPaymentPartyById = tableExists("invoice_allocations") && tableExists("purchases") ? safePrepare(
    `SELECT COALESCE(a.name, '') as party
     FROM invoice_allocations ia
     JOIN purchases p ON p.id = ia.invoice_id
     LEFT JOIN accounts a ON a.id = p.supplier_id
     WHERE ia.voucher_type = 'payment' AND ia.voucher_id = ?
     ORDER BY ia.id DESC
     LIMIT 1`,
  ) : null;
  const receiptVoucherById = tableExists("receipt_vouchers") ? safePrepare(
    `SELECT id, voucher_type, voucher_date, total_debit, total_credit
     FROM receipt_vouchers
     WHERE id = ?
     LIMIT 1`,
  ) : null;
  const salePartyByAmountDate = tableExists("sales") ? safePrepare(
    `SELECT COALESCE(a.name, '') as party
     FROM sales s
     LEFT JOIN accounts a ON a.id = s.customer_id
     WHERE ABS(CAST(s.total_amount AS REAL) - ?) < 0.0001
       AND date(CASE WHEN s.sale_date > 1000000000000 THEN s.sale_date / 1000 ELSE s.sale_date END, 'unixepoch')
           = date(?, 'unixepoch')
     ORDER BY s.id DESC
     LIMIT 1`,
  ) : null;
  const purchasePartyByAmountDate = tableExists("purchases") ? safePrepare(
    `SELECT COALESCE(a.name, '') as party
     FROM purchases p
     LEFT JOIN accounts a ON a.id = p.supplier_id
     WHERE ABS(CAST(p.total_amount AS REAL) - ?) < 0.0001
       AND date(CASE WHEN p.purchase_date > 1000000000000 THEN p.purchase_date / 1000 ELSE p.purchase_date END, 'unixepoch')
           = date(?, 'unixepoch')
     ORDER BY p.id DESC
     LIMIT 1`,
  ) : null;
  const voucherAccountTypeById = tableExists("accounts") ? safePrepare(`SELECT type FROM accounts WHERE id = ? LIMIT 1`) : null;
  const accountNameById = tableExists("accounts") ? safePrepare(`SELECT name FROM accounts WHERE id = ? LIMIT 1`) : null;

  const isGenericPartyName = (value: string) => {
    const v = value.trim().toLowerCase();
    if (!v) return true;
    return (
      v === "cash" ||
      v === "cash in hand" ||
      v === "cash account" ||
      v === "bank" ||
      v === "bank account" ||
      v === "unknown"
    );
  };

  for (const row of rows) {
    const currentParty = String(row.party_name ?? "");
    if (!isGenericPartyName(currentParty)) continue;

    const refRaw = String(row.reference_number ?? "");
    const match = refRaw.match(/^([a-zA-Z_]+)-(\d+)$/);
    if (!match) continue;
    const refType = match[1].toLowerCase();
    const refId = Number(match[2]);
    if (!Number.isFinite(refId)) continue;

    let party = "";
    if (refType === "sale" || refType === "sales") {
      party = String((salePartyById?.get(refId) as any)?.party ?? "");
    } else if (refType === "purchase" || refType === "purchases") {
      party = String((purchasePartyById?.get(refId) as any)?.party ?? "");
    } else if (refType === "receipt" || refType === "payment") {
      party = String((receiptPartyById?.get(refId) as any)?.party ?? "");
      if (!party) {
        const allocated =
          refType === "receipt"
            ? (allocatedReceiptPartyById?.get(refId) as any)
            : (allocatedPaymentPartyById?.get(refId) as any);
        party = String(allocated?.party ?? "");
      }
      if (!party) {
        const v = receiptVoucherById?.get(refId) as any;
        const txSec =
          Number((v?.voucher_date ?? row.transaction_date) || 0) > 1000000000000
            ? Math.floor(Number(v?.voucher_date ?? row.transaction_date) / 1000)
            : Math.floor(Number(v?.voucher_date ?? row.transaction_date));
        if (refType === "receipt") {
          const amt = Number(v?.total_debit ?? row.amount ?? 0);
          party = String((salePartyByAmountDate?.get(amt, txSec) as any)?.party ?? "");
        } else {
          const amt = Number(v?.total_credit ?? row.amount ?? 0);
          party = String((purchasePartyByAmountDate?.get(amt, txSec) as any)?.party ?? "");
        }
      }
    }

    // Fallback to linked bank account name when it is a real bank account.
    if (!party && row.bank_account_id) {
      const type = String((voucherAccountTypeById?.get(Number(row.bank_account_id)) as any)?.type ?? "");
      if (type === "bank") {
        party = String((accountNameById?.get(Number(row.bank_account_id)) as any)?.name ?? "");
      }
    }

    if (party && !isGenericPartyName(party)) {
      row.party_name = party;
    }
  }

  const orderedAsc = [...rows].sort((a, b) => (Number(a.transaction_date) - Number(b.transaction_date)) || (a.id - b.id));
  const balances = new Map<string, number>();
  for (const row of orderedAsc) {
    const key = row.account_type === "Bank" ? `bank:${row.bank_account_name || row.bank_account_id || "unknown"}` : "cash";
    const current = balances.get(key) ?? 0;
    const amount = parseAmount(row.amount);
    const next = row.transaction_type === "Receipt" ? current + amount : current - amount;
    balances.set(key, next);
    row.runningBalance = next.toFixed(2);
    row.runningBalanceKey = key;
  }
  const byId = new Map<number, any>(orderedAsc.map((r) => [Number(r.id), r]));
  return rows.map((r) => byId.get(Number(r.id)) || r);
}

export function getCashBook(id: number) {
  return findOne("cash_book", id);
}

export function createCashBook(input: any, userId?: number) {
  assertNotFutureDate(input.transactionDate, "Transaction date");
  const now = nowMs();
  const result = sqlite
    .prepare(
      `INSERT INTO cash_book(
        transaction_date, transaction_type, account_type, bank_account_id, bank_account_name, reference_number,
        party_name, description, amount, category, notes, created_by, updated_by, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      toMs(input.transactionDate),
      input.transactionType,
      input.accountType,
      input.bankAccountId ?? null,
      input.bankAccountName ?? null,
      input.referenceNumber ?? null,
      input.partyName ?? null,
      input.description ?? null,
      input.amount,
      input.category ?? null,
      input.notes ?? null,
      userId ?? null,
      userId ?? null,
      now,
      now,
    );
  const row = getCashBook(Number(result.lastInsertRowid));
  insertAuditLog("cash_book", Number(result.lastInsertRowid), "create", null, row, userId);
  return row;
}

export function updateCashBook(id: number, input: any, userId?: number) {
  const existing = getCashBook(id);
  if (!existing) return undefined;
  assertNotFutureDate(input.transactionDate ?? existing.transaction_date, "Transaction date");
  sqlite
    .prepare(
      `UPDATE cash_book SET
        transaction_date=?, transaction_type=?, account_type=?, bank_account_id=?, bank_account_name=?, reference_number=?,
        party_name=?, description=?, amount=?, category=?, notes=?, updated_by=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      toMs(input.transactionDate ?? existing.transaction_date),
      input.transactionType ?? existing.transaction_type,
      input.accountType ?? existing.account_type,
      input.bankAccountId ?? existing.bank_account_id ?? null,
      input.bankAccountName ?? existing.bank_account_name ?? null,
      input.referenceNumber ?? existing.reference_number ?? null,
      input.partyName ?? existing.party_name ?? null,
      input.description ?? existing.description ?? null,
      input.amount ?? existing.amount,
      input.category ?? existing.category ?? null,
      input.notes ?? existing.notes ?? null,
      userId ?? null,
      nowMs(),
      id,
    );
  const updated = getCashBook(id);
  insertAuditLog("cash_book", id, "update", existing, updated, userId);
  return updated;
}

export function deleteCashBook(id: number, userId?: number) {
  return softDelete("cash_book", id, userId);
}

export function getCashBookBalances() {
  const rows = listCashBook({ sortBy: "transaction_date", sortDir: "asc" }) as any[];
  const balances = new Map<string, number>();
  for (const row of rows) {
    const key = row.account_type === "Bank" ? (row.bank_account_name || `Bank-${row.bank_account_id || "Unknown"}`) : "Cash";
    const curr = balances.get(key) ?? 0;
    const amt = parseAmount(row.amount);
    balances.set(key, row.transaction_type === "Receipt" ? curr + amt : curr - amt);
  }
  return Array.from(balances.entries()).map(([account, balance]) => ({ account, balance: balance.toFixed(2) }));
}

function listReturns(table: "sales_returns_daybook" | "purchase_returns_daybook", filters: ListFilters = {}) {
  ensureDaybookSeededFromLegacy();
  const partyColumn = table === "sales_returns_daybook" ? "customer_name" : "supplier_name";
  const amountColumn = table === "sales_returns_daybook" ? "total_credit_amount" : "total_debit_amount";
  const dateColumn = "return_date";
  const sortBy = safeSort(filters.sortBy, dateColumn, [dateColumn, "status", "created_at"]);
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const { whereSql, params } = buildCommonFilters(filters, partyColumn, amountColumn, dateColumn);
  return sqlite.prepare(`SELECT * FROM ${table} WHERE ${whereSql} ORDER BY ${sortBy} ${sortDir}, id DESC`).all(...params);
}

export function listSalesReturnsDaybook(filters: ListFilters = {}) {
  return listReturns("sales_returns_daybook", filters);
}

export function getSalesReturnsDaybook(id: number) {
  return findOne("sales_returns_daybook", id);
}

export function createSalesReturnsDaybook(input: any, userId?: number) {
  assertNotFutureDate(input.returnDate, "Return date");
  const dup = sqlite
    .prepare(`SELECT id FROM sales_returns_daybook WHERE credit_note_number = ? AND is_deleted = 0`)
    .get(input.creditNoteNumber) as any;
  if (dup) throw new Error("Duplicate credit note number");
  const now = nowMs();
  const narration = buildSalesReturnNarration({
    description: input.description,
    reason: input.reason,
    notes: input.notes,
    customerName: input.customerName,
    returnNumber: input.creditNoteNumber,
    invoiceNumber: input.originalInvoiceReference,
  });
  const result = sqlite
    .prepare(
      `INSERT INTO sales_returns_daybook(
        return_date, credit_note_number, original_invoice_reference, customer_id, customer_name, description, quantity_returned,
        reason, return_amount, tax_adjustment, total_credit_amount, status, notes, created_by, updated_by, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      toMs(input.returnDate),
      input.creditNoteNumber,
      input.originalInvoiceReference ?? null,
      input.customerId ?? null,
      input.customerName,
      narration,
      input.quantityReturned,
      input.reason ?? null,
      input.returnAmount,
      input.taxAdjustment ?? "0",
      input.totalCreditAmount,
      input.status ?? "Pending",
      input.notes ?? null,
      userId ?? null,
      userId ?? null,
      now,
      now,
    );
  const row = getSalesReturnsDaybook(Number(result.lastInsertRowid));
  insertAuditLog("sales_returns_daybook", Number(result.lastInsertRowid), "create", null, row, userId);
  return row;
}

export function updateSalesReturnsDaybook(id: number, input: any, userId?: number) {
  const existing = getSalesReturnsDaybook(id);
  if (!existing) return undefined;
  assertNotFutureDate(input.returnDate ?? existing.return_date, "Return date");
  if (input.creditNoteNumber && input.creditNoteNumber !== existing.credit_note_number) {
    const dup = sqlite
      .prepare(`SELECT id FROM sales_returns_daybook WHERE credit_note_number = ? AND is_deleted = 0 AND id != ?`)
      .get(input.creditNoteNumber, id) as any;
    if (dup) throw new Error("Duplicate credit note number");
  }
  sqlite
    .prepare(
      `UPDATE sales_returns_daybook SET
        return_date=?, credit_note_number=?, original_invoice_reference=?, customer_id=?, customer_name=?, description=?, quantity_returned=?,
        reason=?, return_amount=?, tax_adjustment=?, total_credit_amount=?, status=?, notes=?, updated_by=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      toMs(input.returnDate ?? existing.return_date),
      input.creditNoteNumber ?? existing.credit_note_number,
      input.originalInvoiceReference ?? existing.original_invoice_reference ?? null,
      input.customerId ?? existing.customer_id ?? null,
      input.customerName ?? existing.customer_name,
      input.description ?? existing.description ?? null,
      input.quantityReturned ?? existing.quantity_returned,
      input.reason ?? existing.reason ?? null,
      input.returnAmount ?? existing.return_amount,
      input.taxAdjustment ?? existing.tax_adjustment,
      input.totalCreditAmount ?? existing.total_credit_amount,
      input.status ?? existing.status,
      input.notes ?? existing.notes ?? null,
      userId ?? null,
      nowMs(),
      id,
    );
  const updated = getSalesReturnsDaybook(id);
  insertAuditLog("sales_returns_daybook", id, "update", existing, updated, userId);
  return updated;
}

export function deleteSalesReturnsDaybook(id: number, userId?: number) {
  return softDelete("sales_returns_daybook", id, userId);
}

export function listPurchaseReturnsDaybook(filters: ListFilters = {}) {
  return listReturns("purchase_returns_daybook", filters);
}

export function getPurchaseReturnsDaybook(id: number) {
  return findOne("purchase_returns_daybook", id);
}

export function createPurchaseReturnsDaybook(input: any, userId?: number) {
  assertNotFutureDate(input.returnDate, "Return date");
  const dup = sqlite
    .prepare(`SELECT id FROM purchase_returns_daybook WHERE debit_note_number = ? AND is_deleted = 0`)
    .get(input.debitNoteNumber) as any;
  if (dup) throw new Error("Duplicate debit note number");
  const now = nowMs();
  const narration = buildPurchaseReturnNarration({
    description: input.description,
    reason: input.reason,
    notes: input.notes,
    supplierName: input.supplierName,
    returnNumber: input.debitNoteNumber,
    invoiceNumber: input.originalPurchaseReference,
  });
  const result = sqlite
    .prepare(
      `INSERT INTO purchase_returns_daybook(
        return_date, debit_note_number, original_purchase_reference, supplier_id, supplier_name, description, quantity_returned,
        reason, return_amount, tax_adjustment, total_debit_amount, status, notes, created_by, updated_by, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      toMs(input.returnDate),
      input.debitNoteNumber,
      input.originalPurchaseReference ?? null,
      input.supplierId ?? null,
      input.supplierName,
      narration,
      input.quantityReturned,
      input.reason ?? null,
      input.returnAmount,
      input.taxAdjustment ?? "0",
      input.totalDebitAmount,
      input.status ?? "Pending",
      input.notes ?? null,
      userId ?? null,
      userId ?? null,
      now,
      now,
    );
  const row = getPurchaseReturnsDaybook(Number(result.lastInsertRowid));
  insertAuditLog("purchase_returns_daybook", Number(result.lastInsertRowid), "create", null, row, userId);
  return row;
}

export function updatePurchaseReturnsDaybook(id: number, input: any, userId?: number) {
  const existing = getPurchaseReturnsDaybook(id);
  if (!existing) return undefined;
  assertNotFutureDate(input.returnDate ?? existing.return_date, "Return date");
  if (input.debitNoteNumber && input.debitNoteNumber !== existing.debit_note_number) {
    const dup = sqlite
      .prepare(`SELECT id FROM purchase_returns_daybook WHERE debit_note_number = ? AND is_deleted = 0 AND id != ?`)
      .get(input.debitNoteNumber, id) as any;
    if (dup) throw new Error("Duplicate debit note number");
  }
  sqlite
    .prepare(
      `UPDATE purchase_returns_daybook SET
        return_date=?, debit_note_number=?, original_purchase_reference=?, supplier_id=?, supplier_name=?, description=?, quantity_returned=?,
        reason=?, return_amount=?, tax_adjustment=?, total_debit_amount=?, status=?, notes=?, updated_by=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      toMs(input.returnDate ?? existing.return_date),
      input.debitNoteNumber ?? existing.debit_note_number,
      input.originalPurchaseReference ?? existing.original_purchase_reference ?? null,
      input.supplierId ?? existing.supplier_id ?? null,
      input.supplierName ?? existing.supplier_name,
      input.description ?? existing.description ?? null,
      input.quantityReturned ?? existing.quantity_returned,
      input.reason ?? existing.reason ?? null,
      input.returnAmount ?? existing.return_amount,
      input.taxAdjustment ?? existing.tax_adjustment,
      input.totalDebitAmount ?? existing.total_debit_amount,
      input.status ?? existing.status,
      input.notes ?? existing.notes ?? null,
      userId ?? null,
      nowMs(),
      id,
    );
  const updated = getPurchaseReturnsDaybook(id);
  insertAuditLog("purchase_returns_daybook", id, "update", existing, updated, userId);
  return updated;
}

export function deletePurchaseReturnsDaybook(id: number, userId?: number) {
  return softDelete("purchase_returns_daybook", id, userId);
}

function nextJournalEntryNumber() {
  const row = sqlite.prepare(`SELECT id FROM general_journal ORDER BY id DESC LIMIT 1`).get() as any;
  const next = Number(row?.id || 0) + 1;
  return `GJ-${String(next).padStart(6, "0")}`;
}

export function listGeneralJournal(filters: ListFilters & { account?: string; entryType?: string; limit?: number } = {}) {
  ensureDaybookSeededFromLegacy();
  const where: string[] = ["gj.is_deleted = 0"];
  const params: any[] = [];
  if (filters.dateFrom) {
    where.push("gj.transaction_date >= ?");
    params.push(toMs(filters.dateFrom));
  }
  if (filters.dateTo) {
    where.push("gj.transaction_date <= ?");
    params.push(toEndOfDayMs(filters.dateTo));
  }
  if (filters.status) {
    where.push("gj.status = ?");
    params.push(filters.status);
  }
  if (filters.entryType) {
    where.push("gj.entry_type = ?");
    params.push(filters.entryType);
  }
  if (filters.search) {
    where.push("(COALESCE(gj.description,'') LIKE ? OR COALESCE(gj.notes,'') LIKE ? OR COALESCE(gj.journal_entry_number,'') LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.account) {
    where.push(`EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.journal_id = gj.id AND jl.is_deleted = 0 AND jl.account_name LIKE ?)`);
    params.push(`%${filters.account}%`);
  }
  const sortBy = safeSort(filters.sortBy, "gj.transaction_date", ["gj.transaction_date", "gj.journal_entry_number", "gj.total_debits", "gj.status", "gj.created_at"]);
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const limit = filters.limit == null ? "" : ` LIMIT ${clampInt(filters.limit, 100, 1, 500)}`;
  const rows = sqlite.prepare(`SELECT gj.* FROM general_journal gj WHERE ${where.join(" AND ")} ORDER BY ${sortBy} ${sortDir}, gj.id DESC${limit}`).all(...params) as any[];
  const lineStmt = sqlite.prepare(`SELECT * FROM journal_lines WHERE journal_id = ? AND is_deleted = 0 ORDER BY id ASC`);
  return rows.map((row) => ({ ...row, lines: lineStmt.all(row.id) }));
}

export function getGeneralJournal(id: number) {
  const head = findOne("general_journal", id);
  if (!head) return undefined;
  const lines = sqlite.prepare(`SELECT * FROM journal_lines WHERE journal_id = ? AND is_deleted = 0 ORDER BY id ASC`).all(id);
  return { ...head, lines };
}

export function createGeneralJournal(input: any, userId?: number) {
  assertNotFutureDate(input.transactionDate, "Transaction date");
  const lines = (input.lines || []) as JournalLineInput[];
  if (lines.length < 2) throw new Error("At least two journal lines are required");
  const totals = sumLines(lines);
  if (Math.abs(totals.debit - totals.credit) > 0.0001) throw new Error("Total debits must equal total credits");
  const entryNo = input.journalEntryNumber || nextJournalEntryNumber();
  const dup = sqlite.prepare(`SELECT id FROM general_journal WHERE journal_entry_number = ? AND is_deleted = 0`).get(entryNo) as any;
  if (dup) throw new Error("Duplicate journal entry number");
  const now = nowMs();
  const trx = sqlite.transaction(() => {
    const result = sqlite
      .prepare(
        `INSERT INTO general_journal(
          transaction_date, journal_entry_number, description, entry_type, total_debits, total_credits, status,
          approved_by, attachment_paths, notes, created_by, updated_by, created_at, updated_at, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        toMs(input.transactionDate),
        entryNo,
        input.description,
        input.entryType ?? null,
        totals.debit.toFixed(2),
        totals.credit.toFixed(2),
        input.status ?? "Draft",
        input.approvedBy ?? null,
        input.attachmentPaths ? JSON.stringify(input.attachmentPaths) : null,
        input.notes ?? null,
        userId ?? null,
        userId ?? null,
        now,
        now,
      );
    const journalId = Number(result.lastInsertRowid);
    const insertLine = sqlite.prepare(
      `INSERT INTO journal_lines(
        journal_id, account_id, account_name, debit_amount, credit_amount, line_description, notes, created_by, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    for (const line of lines) {
      insertLine.run(
        journalId,
        line.accountId ?? null,
        line.accountName,
        line.debitAmount ?? "0",
        line.creditAmount ?? "0",
        line.lineDescription ?? null,
        line.notes ?? null,
        userId ?? null,
        now,
        now,
      );
    }
    const row = getGeneralJournal(journalId);
    insertAuditLog("general_journal", journalId, "create", null, row, userId);
    return row;
  });
  return trx();
}

export function updateGeneralJournal(id: number, input: any, userId?: number) {
  const existing = getGeneralJournal(id);
  if (!existing) return undefined;
  if (existing.status === "Approved") throw new Error("Approved journal entries cannot be edited");
  assertNotFutureDate(input.transactionDate ?? existing.transaction_date, "Transaction date");
  const lines = (input.lines || existing.lines) as JournalLineInput[];
  if (lines.length < 2) throw new Error("At least two journal lines are required");
  const totals = sumLines(lines);
  if (Math.abs(totals.debit - totals.credit) > 0.0001) throw new Error("Total debits must equal total credits");
  const entryNo = input.journalEntryNumber ?? existing.journal_entry_number;
  if (entryNo !== existing.journal_entry_number) {
    const dup = sqlite.prepare(`SELECT id FROM general_journal WHERE journal_entry_number = ? AND is_deleted = 0 AND id != ?`).get(entryNo, id) as any;
    if (dup) throw new Error("Duplicate journal entry number");
  }
  const trx = sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE general_journal SET
          transaction_date=?, journal_entry_number=?, description=?, entry_type=?, total_debits=?, total_credits=?,
          status=?, approved_by=?, attachment_paths=?, notes=?, updated_by=?, updated_at=?
         WHERE id=?`,
      )
      .run(
        toMs(input.transactionDate ?? existing.transaction_date),
        entryNo,
        input.description ?? existing.description,
        input.entryType ?? existing.entry_type ?? null,
        totals.debit.toFixed(2),
        totals.credit.toFixed(2),
        input.status ?? existing.status,
        input.approvedBy ?? existing.approved_by ?? null,
        input.attachmentPaths ? JSON.stringify(input.attachmentPaths) : existing.attachment_paths ?? null,
        input.notes ?? existing.notes ?? null,
        userId ?? null,
        nowMs(),
        id,
      );
    sqlite.prepare(`UPDATE journal_lines SET is_deleted = 1, updated_at = ? WHERE journal_id = ?`).run(nowMs(), id);
    const insertLine = sqlite.prepare(
      `INSERT INTO journal_lines(
        journal_id, account_id, account_name, debit_amount, credit_amount, line_description, notes, created_by, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    const now = nowMs();
    for (const line of lines) {
      insertLine.run(
        id,
        line.accountId ?? null,
        line.accountName,
        line.debitAmount ?? "0",
        line.creditAmount ?? "0",
        line.lineDescription ?? null,
        line.notes ?? null,
        userId ?? null,
        now,
        now,
      );
    }
    const updated = getGeneralJournal(id);
    insertAuditLog("general_journal", id, "update", existing, updated, userId);
    return updated;
  });
  return trx();
}

export function deleteGeneralJournal(id: number, userId?: number) {
  return softDelete("general_journal", id, userId);
}

export function reverseGeneralJournal(id: number, userId?: number) {
  const existing = getGeneralJournal(id);
  if (!existing) return undefined;
  if (existing.status === "Reversed") throw new Error("Journal entry already reversed");
  const reversedLines = (existing.lines || []).map((line: any) => ({
    accountId: line.account_id ?? undefined,
    accountName: line.account_name,
    debitAmount: String(line.credit_amount ?? "0"),
    creditAmount: String(line.debit_amount ?? "0"),
    lineDescription: `Reverse: ${line.line_description || ""}`.trim(),
    notes: line.notes ?? undefined,
  }));
  const reverse = createGeneralJournal(
    {
      transactionDate: new Date(),
      description: `Reversal of ${existing.journal_entry_number}: ${existing.description}`,
      entryType: "Reversal",
      status: "Approved",
      lines: reversedLines,
      notes: `Auto-reversal for journal ${existing.journal_entry_number}`,
    },
    userId,
  );
  sqlite.prepare(`UPDATE general_journal SET status = 'Reversed', updated_by = ?, updated_at = ? WHERE id = ?`).run(userId ?? null, nowMs(), id);
  const updated = getGeneralJournal(id);
  insertAuditLog("general_journal", id, "reverse", existing, updated, userId);
  return { reversedFrom: updated, reversalEntry: reverse };
}

export function cancelGeneralJournal(id: number, userId?: number) {
  const existing = getGeneralJournal(id);
  if (!existing) return undefined;
  sqlite.prepare(`UPDATE general_journal SET status = 'Cancelled', updated_by = ?, updated_at = ? WHERE id = ?`).run(userId ?? null, nowMs(), id);
  const updated = getGeneralJournal(id);
  insertAuditLog("general_journal", id, "cancel", existing, updated, userId);
  return updated;
}

function escapeCsvCell(value: any): string {
  if (value == null) return "";
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(headers: string[], rows: any[]) {
  const head = headers.map(escapeCsvCell).join(",");
  const lines = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(","));
  return [head, ...lines].join("\r\n");
}

export function exportDaybookCsv(kind: "sales" | "purchases" | "cash" | "sales-returns" | "purchase-returns" | "general-journal", filters: any = {}) {
  if (kind === "sales") return toCsv(Object.keys((listSalesDaybook(filters)[0] as any) || {}), listSalesDaybook(filters) as any[]);
  if (kind === "purchases") return toCsv(Object.keys((listPurchasesDaybook(filters)[0] as any) || {}), listPurchasesDaybook(filters) as any[]);
  if (kind === "cash") return toCsv(Object.keys((listCashBook(filters)[0] as any) || {}), listCashBook(filters) as any[]);
  if (kind === "sales-returns") return toCsv(Object.keys((listSalesReturnsDaybook(filters)[0] as any) || {}), listSalesReturnsDaybook(filters) as any[]);
  if (kind === "purchase-returns") return toCsv(Object.keys((listPurchaseReturnsDaybook(filters)[0] as any) || {}), listPurchaseReturnsDaybook(filters) as any[]);
  const rows = listGeneralJournal(filters);
  return toCsv(Object.keys((rows[0] as any) || {}), rows as any[]);
}

export function getDaybookAudit(daybookType?: string, recordId?: number) {
  const where: string[] = [];
  const params: any[] = [];
  if (daybookType) {
    where.push("daybook_type = ?");
    params.push(daybookType);
  }
  if (recordId) {
    where.push("record_id = ?");
    params.push(recordId);
  }
  const sql = `SELECT * FROM daybook_audit_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY changed_at DESC LIMIT 500`;
  return sqlite.prepare(sql).all(...params);
}

export function getDaybookDashboardSummary() {
  ensureDaybookSeededFromLegacy();
  const scalar = (query: string, ...params: any[]) => sqlite.prepare(query).get(...params) as any;
  const sales = scalar(`SELECT COALESCE(SUM(CAST(total_amount AS REAL)), 0) as total FROM sales_daybook WHERE is_deleted = 0`);
  const purchases = scalar(`SELECT COALESCE(SUM(CAST(total_amount AS REAL)), 0) as total FROM purchases_daybook WHERE is_deleted = 0`);
  const pendingReturns =
    (scalar(`SELECT COUNT(*) as c FROM sales_returns_daybook WHERE is_deleted = 0 AND status = 'Pending'`)?.c ?? 0) +
    (scalar(`SELECT COUNT(*) as c FROM purchase_returns_daybook WHERE is_deleted = 0 AND status = 'Pending'`)?.c ?? 0);
  return {
    totalCreditSales: Number(sales?.total || 0).toFixed(2),
    totalCreditPurchases: Number(purchases?.total || 0).toFixed(2),
    cashBankBalances: getCashBookBalances(),
    pendingReturns,
    recentJournalEntries: listGeneralJournal({ limit: 5 }),
  };
}

export function migrateLegacyDayBook(migrationDate?: Date, userId?: number) {
  const mig = toMs(migrationDate ?? new Date()) ?? nowMs();
  const trx = sqlite.transaction(() => {
    // Sales and purchases are reconciled continuously by syncSalesDaybook /
    // syncPurchasesDaybook, which key on sale_id / purchase_id. Re-inserting
    // them here matched on invoice_number only and produced unlinked duplicates.
    const salesSynced = syncSalesDaybook();
    const purchasesSynced = syncPurchasesDaybook();


    const cashRows = sqlite.prepare(`SELECT ct.*, a.name as account_name FROM cash_transactions ct LEFT JOIN accounts a ON a.id = ct.account_id WHERE ct.deleted_at IS NULL`).all() as any[];
    for (const row of cashRows) {
      const refNo = `${row.reference_type || "cash"}-${row.reference_id || row.id}`;
      const exists = sqlite
        .prepare(`SELECT id FROM cash_book WHERE reference_number = ? AND is_deleted = 0`)
        .get(refNo) as any;
      if (exists) continue;
      sqlite
        .prepare(
          `INSERT INTO cash_book(
            transaction_date, transaction_type, account_type, bank_account_id, bank_account_name, reference_number,
            party_name, description, amount, category, notes, created_by, updated_by, created_at, updated_at, is_deleted, migration_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(
          toMs(row.transaction_date),
          row.transaction_type === "DEBIT" ? "Receipt" : "Payment",
          (row.account_name || "").toLowerCase().includes("bank") ? "Bank" : "Cash",
          (row.account_name || "").toLowerCase().includes("bank") ? row.account_id : null,
          (row.account_name || "").toLowerCase().includes("bank") ? row.account_name : null,
          refNo,
          row.account_name || "Unknown",
          row.narration || "",
          row.amount || "0",
          row.reference_type || "misc",
          row.narration || null,
          row.created_by ?? userId ?? null,
          userId ?? null,
          nowMs(),
          nowMs(),
          mig,
        );
    }

    dedupeCashBookRows();

    const journalRows = sqlite.prepare(`SELECT * FROM journal_vouchers`).all() as any[];
    const journalLinesStmt = sqlite.prepare(`SELECT * FROM journal_voucher_entries WHERE journal_voucher_id = ?`);
    for (const row of journalRows) {
      const exists = sqlite.prepare(`SELECT id FROM general_journal WHERE journal_entry_number = ? AND is_deleted = 0`).get(row.voucher_no) as any;
      if (exists) continue;
      const lines = journalLinesStmt.all(row.id) as any[];
      const result = sqlite
        .prepare(
          `INSERT INTO general_journal(
            transaction_date, journal_entry_number, description, entry_type, total_debits, total_credits, status,
            approved_by, notes, created_by, updated_by, created_at, updated_at, is_deleted, migration_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(
          toMs(row.voucher_date),
          row.voucher_no,
          row.narration || "",
          "Migration",
          row.total_amount || "0",
          row.total_amount || "0",
          row.status === "approved" ? "Approved" : "Draft",
          row.approved_by ?? null,
          "Migrated from journal_vouchers",
          row.created_by ?? userId ?? null,
          userId ?? null,
          nowMs(),
          nowMs(),
          mig,
        );
      const journalId = Number(result.lastInsertRowid);
      const insertLine = sqlite.prepare(
        `INSERT INTO journal_lines(
          journal_id, account_id, account_name, debit_amount, credit_amount, line_description, created_by, created_at, updated_at, is_deleted
        ) VALUES (?, ?, COALESCE((SELECT name FROM accounts WHERE id = ?), 'Unknown Account'), ?, ?, ?, ?, ?, ?, 0)`,
      );
      for (const line of lines) {
        insertLine.run(
          journalId,
          line.account_id ?? null,
          line.account_id ?? null,
          line.entry_type === "DEBIT" ? line.amount : "0",
          line.entry_type === "CREDIT" ? line.amount : "0",
          "Migrated line",
          userId ?? null,
          nowMs(),
          nowMs(),
        );
      }
    }

    return {
      migrationDate: mig,
      salesMigrated: salesSynced,
      purchasesMigrated: purchasesSynced,
      cashMigrated: cashRows.length,
      journalsMigrated: journalRows.length,
    };
  });

  return trx();
}
