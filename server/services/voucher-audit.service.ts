import { db, sqlite } from "../models/db";
import { receiptVoucherAuditLogs } from "../db/schema";

/**
 * Audit logging for receipt/payment vouchers.
 *
 * Mirrors `insertAuditLog` in daybooks.service.ts — payments.service.ts and
 * receipts.service.ts moved money without recording who changed what, while
 * every daybook write already captured a before/after snapshot.
 */

// Idempotent, same approach as daybooks.service.ts's ensureTables(): keeps
// existing databases working without a manual migration run. The equivalent DDL
// lives in script/0002_receipt_voucher_audit_logs.sql.
function ensureTable() {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS receipt_voucher_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_type TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  changed_by INTEGER,
  changed_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_receipt_voucher_audit
  ON receipt_voucher_audit_logs(voucher_type, record_id, changed_at);
`);
}

ensureTable();

export type VoucherAuditAction = "create" | "update" | "delete";

/**
 * Writes one audit row. Never throws: an audit failure must not roll back or
 * fail a voucher that has already been written, and must not change the
 * response the controller sends.
 */
export function insertVoucherAuditLog(
  voucherType: string,
  recordId: number,
  action: VoucherAuditAction,
  beforeJson: unknown,
  afterJson: unknown,
  userId?: number,
) {
  try {
    db.insert(receiptVoucherAuditLogs)
      .values({
        voucherType,
        recordId,
        action,
        beforeJson: beforeJson ? JSON.stringify(beforeJson) : null,
        afterJson: afterJson ? JSON.stringify(afterJson) : null,
        changedBy: userId ?? null,
        changedAt: new Date(),
      })
      .run();
  } catch (error) {
    console.error("Failed to write receipt voucher audit log", error);
  }
}

/** Audit rows for one voucher, newest first. */
export function getVoucherAuditLogs(recordId: number) {
  return sqlite
    .prepare(
      `SELECT * FROM receipt_voucher_audit_logs WHERE record_id = ? ORDER BY changed_at DESC, id DESC LIMIT 500`,
    )
    .all(recordId);
}
