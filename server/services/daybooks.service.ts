import { sqlite } from "../models/db";
import { buildPurchaseReturnNarration, buildSalesReturnNarration } from "../utils/narration";
import { assertPostingAllowed } from "./posting-guard.service";

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
      `INSERT INTO audit_logs(entity, entity_id, action, before_json, after_json, performed_by, performed_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'daybook')`,
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

function paymentStatusSql() {
  return `CASE
    WHEN CAST(COALESCE(s.paid_amount, '0') AS REAL) <= 0 THEN 'Pending'
    WHEN CAST(COALESCE(s.paid_amount, '0') AS REAL) >= CAST(COALESCE(s.total_amount, '0') AS REAL) THEN 'Fully Paid'
    ELSE 'Partially Paid'
  END`;
}

function ensureViews() {
  const hasSales = tableExists("sales");
  const hasPurchases = tableExists("purchases");

  sqlite.exec(`DROP VIEW IF EXISTS sales_daybook`);
  if (hasSales) {
    sqlite.exec(`
CREATE VIEW sales_daybook AS
SELECT
  s.id,
  s.id AS sale_id,
  CAST(s.sale_date AS INTEGER) AS transaction_date,
  s.invoice_number,
  s.customer_id,
  COALESCE(a.name, 'Unknown Customer') AS customer_name,
  NULL AS customer_account_details,
  s.notes AS description,
  '1' AS quantity,
  s.subtotal AS unit_price,
  s.subtotal AS subtotal_amount,
  COALESCE(s.tax_amount, '0') AS tax_amount,
  COALESCE(s.total_amount, '0') AS total_amount,
  'Net 30' AS payment_terms,
  CAST(s.due_date AS INTEGER) AS due_date,
  COALESCE(s.paid_amount, '0') AS paid_amount,
  ${paymentStatusSql()} AS status,
  s.notes,
  s.created_by,
  s.created_by AS updated_by,
  CAST(s.created_at AS INTEGER) AS created_at,
  CAST(s.created_at AS INTEGER) AS updated_at,
  0 AS is_deleted
FROM sales s
LEFT JOIN accounts a ON a.id = s.customer_id
    `);
  }

  sqlite.exec(`DROP VIEW IF EXISTS purchases_daybook`);
  if (hasPurchases) {
    const hasDeletedAt = columnExists("purchases", "deleted_at");
    sqlite.exec(`
CREATE VIEW purchases_daybook AS
SELECT
  s.id,
  s.id AS purchase_id,
  CAST(s.purchase_date AS INTEGER) AS transaction_date,
  s.invoice_number,
  s.supplier_id,
  COALESCE(a.name, 'Unknown Supplier') AS supplier_name,
  NULL AS supplier_account_details,
  s.notes AS description,
  CASE
    WHEN CAST(COALESCE(s.total_bags, '0') AS REAL) > 0 THEN s.total_bags
    WHEN CAST(COALESCE(s.total_net_weight_kg, '0') AS REAL) > 0 THEN s.total_net_weight_kg
    ELSE '1'
  END AS quantity,
  CASE
    WHEN CAST(COALESCE(s.total_bags, '0') AS REAL) > 0 THEN CAST(CAST(COALESCE(s.subtotal, '0') AS REAL) / CAST(s.total_bags AS REAL) AS TEXT)
    WHEN CAST(COALESCE(s.total_net_weight_kg, '0') AS REAL) > 0 THEN CAST(CAST(COALESCE(s.subtotal, '0') AS REAL) / CAST(s.total_net_weight_kg AS REAL) AS TEXT)
    ELSE COALESCE(s.subtotal, '0')
  END AS unit_price,
  COALESCE(s.subtotal, '0') AS subtotal_amount,
  COALESCE(s.tax_amount, '0') AS tax_amount,
  COALESCE(s.total_amount, '0') AS total_amount,
  'Net 30' AS payment_terms,
  CAST(s.due_date AS INTEGER) AS due_date,
  COALESCE(s.paid_amount, '0') AS paid_amount,
  ${paymentStatusSql()} AS status,
  s.notes,
  s.created_by,
  s.created_by AS updated_by,
  CAST(s.created_at AS INTEGER) AS created_at,
  CAST(s.created_at AS INTEGER) AS updated_at,
  ${hasDeletedAt ? "CASE WHEN s.deleted_at IS NOT NULL THEN 1 ELSE 0 END" : "0"} AS is_deleted
FROM purchases s
LEFT JOIN accounts a ON a.id = s.supplier_id
    `);
  }
}

function ensureTables() {
  sqlite.exec(`
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
CREATE INDEX IF NOT EXISTS idx_cash_book_date ON cash_book(transaction_date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns_daybook(return_date);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns_daybook(return_date);
`);
}

ensureTables();
ensureViews();

function normalizeLegacyEpochColumns() {
  const updates = [
    `UPDATE cash_book SET transaction_date = transaction_date * 1000 WHERE transaction_date > 0 AND transaction_date < 1000000000000`,
    `UPDATE sales_returns_daybook SET return_date = return_date * 1000 WHERE return_date > 0 AND return_date < 1000000000000`,
    `UPDATE purchase_returns_daybook SET return_date = return_date * 1000 WHERE return_date > 0 AND return_date < 1000000000000`,
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

function ensureDaybookSeededFromLegacy() {
  // The remaining projections (cash book, returns) still rely on the
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
               (SELECT COUNT(*) FROM purchase_returns_daybook) AS c`,
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

function softDelete(table: string, id: number, userId?: number, dateColumn = "transaction_date", context = table) {
  const existing = findOne(table, id);
  if (!existing) return false;
  // Closes a period-lock bypass: daybook deletes used to write without checking
  // period locks, unlike the legacy storage.ts posting flows.
  assertPostingAllowed(sqlite, existing[dateColumn], context);
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
  const openings = new Map<string, number>();
  for (const row of orderedAsc) {
    const key = cashBookBalanceKey(row);
    if (!openings.has(key)) openings.set(key, cashBookOpeningBalance(key, row));
    const current = balances.get(key) ?? openings.get(key)!;
    const amount = parseAmount(row.amount);
    const next = row.transaction_type === "Receipt" ? current + amount : current - amount;
    balances.set(key, next);
    row.runningBalance = next.toFixed(2);
    row.runningBalanceKey = key;
    // Carried on every row (as getAccountLedger does) so the caller can show an
    // opening line without a second round trip.
    row.openingBalance = openings.get(key)!.toFixed(2);
  }
  const byId = new Map<number, any>(orderedAsc.map((r) => [Number(r.id), r]));
  return rows.map((r) => byId.get(Number(r.id)) || r);
}

/** Bucket a cash book row belongs to: the single cash drawer, or one bank account. */
function cashBookBalanceKey(row: any): string {
  return row.account_type === "Bank"
    ? `bank:${row.bank_account_name || row.bank_account_id || "unknown"}`
    : "cash";
}

/**
 * Balance a bucket starts from before its first row.
 *
 * The register only stores movements, so without this every running balance
 * started at zero and silently dropped whatever float the mill opened with.
 * Cash reads `cash_accounts` — the same source of truth the Cash in Hand module
 * uses, kept in step with the ledger's "Cash in Hand" account by
 * updateCashAccountOpeningBalance — and banks read their own ledger account.
 */
function cashBookOpeningBalance(key: string, row: any): number {
  if (key === "cash") {
    const acc = sqlite
      .prepare("SELECT opening_balance FROM cash_accounts WHERE id = 1")
      .get() as { opening_balance?: string } | undefined;
    return parseAmount(acc?.opening_balance ?? 0);
  }
  const bank = row.bank_account_id
    ? (sqlite.prepare("SELECT opening_balance FROM accounts WHERE id = ?").get(row.bank_account_id) as
        | { opening_balance?: string }
        | undefined)
    : row.bank_account_name
      ? (sqlite.prepare("SELECT opening_balance FROM accounts WHERE name = ?").get(row.bank_account_name) as
          | { opening_balance?: string }
          | undefined)
      : undefined;
  return parseAmount(bank?.opening_balance ?? 0);
}

export function getCashBook(id: number) {
  return findOne("cash_book", id);
}

export function createCashBook(input: any, userId?: number) {
  assertNotFutureDate(input.transactionDate, "Transaction date");
  // Closes a period-lock bypass: this write skipped the period/fiscal checks
  // that storage.ts applies to every other posting flow.
  assertPostingAllowed(sqlite, input.transactionDate, "cash book");
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
  // Closes a period-lock bypass: guard both the period the row sits in today and
  // the period it would be moved into.
  assertPostingAllowed(sqlite, existing.transaction_date, "cash book");
  assertPostingAllowed(sqlite, input.transactionDate ?? existing.transaction_date, "cash book");
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
  return softDelete("cash_book", id, userId, "transaction_date", "cash book");
}

export function getCashBookBalances() {
  const rows = listCashBook({ sortBy: "transaction_date", sortDir: "asc" }) as any[];
  const balances = new Map<string, number>();
  for (const row of rows) {
    const key = row.account_type === "Bank" ? (row.bank_account_name || `Bank-${row.bank_account_id || "Unknown"}`) : "Cash";
    // Seeded from the opening balance, not zero — see cashBookOpeningBalance.
    const curr = balances.get(key) ?? cashBookOpeningBalance(cashBookBalanceKey(row), row);
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
  // Closes a period-lock bypass: this write skipped the period/fiscal checks
  // that storage.ts applies to every other posting flow.
  assertPostingAllowed(sqlite, input.returnDate, "sales returns daybook");
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
  // Closes a period-lock bypass: guard both the period the row sits in today and
  // the period it would be moved into.
  assertPostingAllowed(sqlite, existing.return_date, "sales returns daybook");
  assertPostingAllowed(sqlite, input.returnDate ?? existing.return_date, "sales returns daybook");
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
  return softDelete("sales_returns_daybook", id, userId, "return_date", "sales returns daybook");
}

export function listPurchaseReturnsDaybook(filters: ListFilters = {}) {
  return listReturns("purchase_returns_daybook", filters);
}

export function getPurchaseReturnsDaybook(id: number) {
  return findOne("purchase_returns_daybook", id);
}

export function createPurchaseReturnsDaybook(input: any, userId?: number) {
  assertNotFutureDate(input.returnDate, "Return date");
  // Closes a period-lock bypass: this write skipped the period/fiscal checks
  // that storage.ts applies to every other posting flow.
  assertPostingAllowed(sqlite, input.returnDate, "purchase returns daybook");
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
  // Closes a period-lock bypass: guard both the period the row sits in today and
  // the period it would be moved into.
  assertPostingAllowed(sqlite, existing.return_date, "purchase returns daybook");
  assertPostingAllowed(sqlite, input.returnDate ?? existing.return_date, "purchase returns daybook");
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
  return softDelete("purchase_returns_daybook", id, userId, "return_date", "purchase returns daybook");
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

export function exportDaybookCsv(kind: "sales" | "purchases" | "cash" | "sales-returns" | "purchase-returns", filters: any = {}) {
  if (kind === "sales") return toCsv(Object.keys((listSalesDaybook(filters)[0] as any) || {}), listSalesDaybook(filters) as any[]);
  if (kind === "purchases") return toCsv(Object.keys((listPurchasesDaybook(filters)[0] as any) || {}), listPurchasesDaybook(filters) as any[]);
  if (kind === "cash") return toCsv(Object.keys((listCashBook(filters)[0] as any) || {}), listCashBook(filters) as any[]);
  if (kind === "sales-returns") return toCsv(Object.keys((listSalesReturnsDaybook(filters)[0] as any) || {}), listSalesReturnsDaybook(filters) as any[]);
  if (kind === "purchase-returns") return toCsv(Object.keys((listPurchaseReturnsDaybook(filters)[0] as any) || {}), listPurchaseReturnsDaybook(filters) as any[]);
  return "";
}

export function getDaybookAudit(daybookType?: string, recordId?: number) {
  const where: string[] = ["source = 'daybook'"];
  const params: any[] = [];
  if (daybookType) {
    where.push("entity = ?");
    params.push(daybookType);
  }
  if (recordId) {
    where.push("entity_id = ?");
    params.push(recordId);
  }
  const sql = `SELECT * FROM audit_logs WHERE ${where.join(" AND ")} ORDER BY performed_at DESC LIMIT 500`;
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
  };
}

export function migrateLegacyDayBook(migrationDate?: Date, userId?: number) {
  const mig = toMs(migrationDate ?? new Date()) ?? nowMs();
  const trx = sqlite.transaction(() => {
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
          row.transaction_type === "debit" ? "Receipt" : "Payment",
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

    return {
      migrationDate: mig,
      cashMigrated: cashRows.length,
    };
  });

  return trx();
}
