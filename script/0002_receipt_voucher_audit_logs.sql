-- Audit trail for receipt/payment vouchers.
-- Modeled on daybook_audit_logs: payments.service.ts and receipts.service.ts moved
-- money with no audit record at all, unlike every daybook write.
--
-- Usage:
--   sqlite3 .local/data.db ".backup .local/data-before-voucher-audit.db"
--   sqlite3 .local/data.db ".read script/0002_receipt_voucher_audit_logs.sql"

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS receipt_voucher_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_type TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  -- No FK to users, matching daybook_audit_logs: an audit row must never be
  -- rejected because the acting user id can't be resolved.
  changed_by INTEGER,
  changed_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_receipt_voucher_audit
  ON receipt_voucher_audit_logs(voucher_type, record_id, changed_at);

COMMIT;
