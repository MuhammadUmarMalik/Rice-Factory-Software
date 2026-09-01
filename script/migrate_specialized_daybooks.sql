-- Specialized Daybooks Migration
-- Usage:
--   sqlite3 .local/data.db ".backup .local/data-before-daybooks.db"
--   sqlite3 .local/data.db ".read script/migrate_specialized_daybooks.sql"

BEGIN TRANSACTION;

-- Sales Daybook
INSERT INTO sales_daybook (
  transaction_date, invoice_number, customer_id, customer_name, description, quantity, unit_price,
  subtotal_amount, tax_amount, total_amount, payment_terms, due_date, paid_amount, status, notes,
  created_by, updated_by, created_at, updated_at, is_deleted, migration_date
)
SELECT
  s.sale_date,
  s.invoice_number,
  s.customer_id,
  COALESCE(a.name, 'Unknown Customer'),
  s.notes,
  '1',
  COALESCE(s.subtotal, '0'),
  COALESCE(s.subtotal, '0'),
  COALESCE(s.tax_amount, '0'),
  COALESCE(s.total_amount, '0'),
  'Net 30',
  NULL,
  COALESCE(s.paid_amount, '0'),
  CASE
    WHEN CAST(COALESCE(s.paid_amount, '0') AS REAL) >= CAST(COALESCE(s.total_amount, '0') AS REAL) THEN 'Fully Paid'
    WHEN CAST(COALESCE(s.paid_amount, '0') AS REAL) > 0 THEN 'Partially Paid'
    ELSE 'Pending'
  END,
  s.notes,
  s.created_by,
  s.created_by,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  0,
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM sales s
LEFT JOIN accounts a ON a.id = s.customer_id
WHERE NOT EXISTS (
  SELECT 1 FROM sales_daybook sd WHERE sd.invoice_number = s.invoice_number AND sd.is_deleted = 0
);

-- Purchases Daybook
INSERT INTO purchases_daybook (
  transaction_date, invoice_number, supplier_id, supplier_name, description, quantity, unit_price,
  subtotal_amount, tax_amount, total_amount, payment_terms, due_date, paid_amount, status, notes,
  created_by, updated_by, created_at, updated_at, is_deleted, migration_date
)
SELECT
  p.purchase_date,
  p.invoice_number,
  p.supplier_id,
  COALESCE(a.name, 'Unknown Supplier'),
  p.notes,
  COALESCE(p.total_bags, '1'),
  COALESCE(p.subtotal, '0'),
  COALESCE(p.subtotal, '0'),
  COALESCE(p.tax_amount, '0'),
  COALESCE(p.total_amount, '0'),
  'Net 30',
  p.due_date,
  COALESCE(p.paid_amount, '0'),
  CASE
    WHEN CAST(COALESCE(p.paid_amount, '0') AS REAL) >= CAST(COALESCE(p.total_amount, '0') AS REAL) THEN 'Fully Paid'
    WHEN CAST(COALESCE(p.paid_amount, '0') AS REAL) > 0 THEN 'Partially Paid'
    ELSE 'Pending'
  END,
  p.notes,
  p.created_by,
  p.created_by,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  0,
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM purchases p
LEFT JOIN accounts a ON a.id = p.supplier_id
WHERE NOT EXISTS (
  SELECT 1 FROM purchases_daybook pd WHERE pd.invoice_number = p.invoice_number AND pd.is_deleted = 0
);

-- Cash Book
INSERT INTO cash_book (
  transaction_date, transaction_type, account_type, bank_account_id, bank_account_name, reference_number,
  party_name, description, amount, category, notes, created_by, updated_by, created_at, updated_at, is_deleted, migration_date
)
SELECT
  ct.transaction_date,
  CASE WHEN ct.transaction_type = 'DEBIT' THEN 'Receipt' ELSE 'Payment' END,
  CASE WHEN LOWER(COALESCE(a.name, '')) LIKE '%bank%' THEN 'Bank' ELSE 'Cash' END,
  CASE WHEN LOWER(COALESCE(a.name, '')) LIKE '%bank%' THEN ct.account_id ELSE NULL END,
  CASE WHEN LOWER(COALESCE(a.name, '')) LIKE '%bank%' THEN a.name ELSE NULL END,
  COALESCE(ct.reference_type, 'cash') || '-' || COALESCE(ct.reference_id, ct.id),
  COALESCE(a.name, 'Unknown'),
  ct.narration,
  COALESCE(ct.amount, '0'),
  COALESCE(ct.reference_type, 'misc'),
  ct.narration,
  ct.created_by,
  ct.created_by,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  0,
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM cash_transactions ct
LEFT JOIN accounts a ON a.id = ct.account_id
WHERE ct.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM cash_book cb
    WHERE cb.reference_number = COALESCE(ct.reference_type, 'cash') || '-' || COALESCE(ct.reference_id, ct.id)
      AND cb.is_deleted = 0
  );

-- General Journal + Journal Lines
INSERT INTO general_journal (
  transaction_date, journal_entry_number, description, entry_type, total_debits, total_credits, status,
  approved_by, notes, created_by, updated_by, created_at, updated_at, is_deleted, migration_date
)
SELECT
  jv.voucher_date,
  jv.voucher_no,
  COALESCE(jv.narration, ''),
  'Migration',
  COALESCE(jv.total_amount, '0'),
  COALESCE(jv.total_amount, '0'),
  CASE WHEN jv.status = 'approved' THEN 'Approved' ELSE 'Draft' END,
  jv.approved_by,
  'Migrated from journal_vouchers',
  jv.created_by,
  jv.created_by,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  0,
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM journal_vouchers jv
WHERE NOT EXISTS (
  SELECT 1 FROM general_journal gj WHERE gj.journal_entry_number = jv.voucher_no AND gj.is_deleted = 0
);

INSERT INTO journal_lines (
  journal_id, account_id, account_name, debit_amount, credit_amount, line_description, created_by, created_at, updated_at, is_deleted
)
SELECT
  gj.id,
  jve.account_id,
  COALESCE(a.name, 'Unknown Account'),
  CASE WHEN jve.entry_type = 'DEBIT' THEN COALESCE(jve.amount, '0') ELSE '0' END,
  CASE WHEN jve.entry_type = 'CREDIT' THEN COALESCE(jve.amount, '0') ELSE '0' END,
  'Migrated line',
  gj.created_by,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  0
FROM general_journal gj
JOIN journal_vouchers jv ON jv.voucher_no = gj.journal_entry_number
JOIN journal_voucher_entries jve ON jve.journal_voucher_id = jv.id
LEFT JOIN accounts a ON a.id = jve.account_id
WHERE gj.entry_type = 'Migration'
  AND NOT EXISTS (
    SELECT 1 FROM journal_lines jl WHERE jl.journal_id = gj.id AND jl.account_id = jve.account_id
  );

COMMIT;
