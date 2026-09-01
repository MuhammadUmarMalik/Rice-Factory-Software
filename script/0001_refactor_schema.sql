-- FIXED: 27
-- Schema refactor migration for typed FKs, enum cleanup, unique indexes, and trigger coverage.

PRAGMA foreign_keys = OFF;

ALTER TABLE accounts ADD COLUMN parent_id integer REFERENCES accounts(id);
ALTER TABLE accounts ADD COLUMN level integer NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN balance_due text NOT NULL DEFAULT '0';

ALTER TABLE sales_daybook ADD COLUMN sale_id integer REFERENCES sales(id);
ALTER TABLE purchases_daybook ADD COLUMN purchase_id integer REFERENCES purchases(id);
ALTER TABLE sales_returns_daybook ADD COLUMN sale_id integer REFERENCES sales(id);
ALTER TABLE purchase_returns_daybook ADD COLUMN purchase_id integer REFERENCES purchases(id);
ALTER TABLE cash_book ADD COLUMN receipt_voucher_id integer REFERENCES receipt_vouchers(id);
ALTER TABLE cash_book ADD COLUMN contra_voucher_id integer REFERENCES contra_vouchers(id);
ALTER TABLE general_journal ADD COLUMN journal_voucher_id integer REFERENCES journal_vouchers(id);

ALTER TABLE receipt_voucher_lines ADD COLUMN sale_id integer REFERENCES sales(id);
ALTER TABLE receipt_voucher_lines ADD COLUMN purchase_id integer REFERENCES purchases(id);

ALTER TABLE cash_transactions ADD COLUMN journal_voucher_id integer REFERENCES journal_vouchers(id);
ALTER TABLE cash_transactions ADD COLUMN receipt_voucher_id integer REFERENCES receipt_vouchers(id);
ALTER TABLE cash_transactions ADD COLUMN contra_voucher_id integer REFERENCES contra_vouchers(id);
ALTER TABLE cash_transactions ADD COLUMN expense_entry_id integer REFERENCES expense_entries(id);

ALTER TABLE ledger_entries ADD COLUMN sale_id integer REFERENCES sales(id);
ALTER TABLE ledger_entries ADD COLUMN purchase_id integer REFERENCES purchases(id);
ALTER TABLE ledger_entries ADD COLUMN receipt_voucher_id integer REFERENCES receipt_vouchers(id);
ALTER TABLE ledger_entries ADD COLUMN journal_voucher_id integer REFERENCES journal_vouchers(id);
ALTER TABLE ledger_entries ADD COLUMN contra_voucher_id integer REFERENCES contra_vouchers(id);
ALTER TABLE ledger_entries ADD COLUMN expense_entry_id integer REFERENCES expense_entries(id);

ALTER TABLE tax_ledgers ADD COLUMN sale_id integer REFERENCES sales(id);
ALTER TABLE tax_ledgers ADD COLUMN purchase_id integer REFERENCES purchases(id);

ALTER TABLE invoice_allocations ADD COLUMN sale_id integer REFERENCES sales(id);
ALTER TABLE invoice_allocations ADD COLUMN purchase_id integer REFERENCES purchases(id);
ALTER TABLE invoice_allocations ADD COLUMN receipt_voucher_id integer REFERENCES receipt_vouchers(id);
ALTER TABLE invoice_allocations ADD COLUMN payment_voucher_id integer REFERENCES contra_vouchers(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_employee_month ON payrolls(employee_id, payroll_month);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_period ON fiscal_periods(fiscal_year_id, year_month);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_line ON budget_lines(budget_id, account_id, year_month);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_rate_period ON tax_rates(tax_type_id, effective_from);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bri_stmt_line ON bank_reconciliation_items(statement_line_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bri_ledger ON bank_reconciliation_items(ledger_entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fob ON fiscal_opening_balances(fiscal_year_id, account_id);

ALTER TABLE payrolls DROP COLUMN payment_status;
ALTER TABLE employees DROP COLUMN basic_salary;
ALTER TABLE purchases DROP COLUMN amount_in_words;
ALTER TABLE journal_vouchers DROP COLUMN amount_in_words;
ALTER TABLE receipt_vouchers DROP COLUMN amount_in_words;
ALTER TABLE receipt_voucher_lines DROP COLUMN reference_type;
ALTER TABLE receipt_voucher_lines DROP COLUMN reference_id;
ALTER TABLE ledger_entries DROP COLUMN reference_type;
ALTER TABLE ledger_entries DROP COLUMN reference_id;
ALTER TABLE cash_transactions DROP COLUMN reference_type;
ALTER TABLE cash_transactions DROP COLUMN reference_id;
ALTER TABLE tax_ledgers DROP COLUMN source_type;
ALTER TABLE tax_ledgers DROP COLUMN source_id;
ALTER TABLE invoice_allocations DROP COLUMN invoice_type;
ALTER TABLE invoice_allocations DROP COLUMN invoice_id;
ALTER TABLE invoice_allocations DROP COLUMN voucher_type;
ALTER TABLE invoice_allocations DROP COLUMN voucher_id;

-- Legacy general_journal -> journal_vouchers migration
INSERT INTO journal_vouchers (voucher_no, voucher_date, total_amount, narration, status, created_by, approved_by, created_at, updated_at)
SELECT
  'JV-LEG-' || gj.id,
  gj.transaction_date,
  COALESCE(gj.total_debits, '0'),
  gj.description,
  CASE WHEN gj.status IN ('approved', 'Approved') THEN 'approved' ELSE 'draft' END,
  gj.created_by,
  gj.approved_by,
  gj.created_at,
  gj.updated_at
FROM general_journal gj
WHERE gj.journal_voucher_id IS NULL;

UPDATE general_journal
SET journal_voucher_id = (
  SELECT jv.id FROM journal_vouchers jv
  WHERE jv.voucher_no = 'JV-LEG-' || general_journal.id
  LIMIT 1
)
WHERE journal_voucher_id IS NULL;

INSERT INTO journal_voucher_entries (journal_voucher_id, account_id, entry_type, amount, created_at)
SELECT
  gj.journal_voucher_id,
  jl.account_id,
  CASE WHEN CAST(COALESCE(jl.debit_amount, '0') AS REAL) > 0 THEN 'DEBIT' ELSE 'CREDIT' END,
  CASE WHEN CAST(COALESCE(jl.debit_amount, '0') AS REAL) > 0 THEN COALESCE(jl.debit_amount, '0') ELSE COALESCE(jl.credit_amount, '0') END,
  jl.created_at
FROM journal_lines jl
JOIN general_journal gj ON gj.id = jl.journal_id
WHERE gj.journal_voucher_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_employees_set_updated_at;
CREATE TRIGGER trg_employees_set_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW
BEGIN
  UPDATE employees SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

DROP TRIGGER IF EXISTS trg_payrolls_set_updated_at;
CREATE TRIGGER trg_payrolls_set_updated_at
BEFORE UPDATE ON payrolls
FOR EACH ROW
BEGIN
  UPDATE payrolls SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

DROP TRIGGER IF EXISTS trg_receipt_vouchers_set_updated_at;
CREATE TRIGGER trg_receipt_vouchers_set_updated_at
BEFORE UPDATE ON receipt_vouchers
FOR EACH ROW
BEGIN
  UPDATE receipt_vouchers SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

DROP TRIGGER IF EXISTS trg_contra_vouchers_set_updated_at;
CREATE TRIGGER trg_contra_vouchers_set_updated_at
BEFORE UPDATE ON contra_vouchers
FOR EACH ROW
BEGIN
  UPDATE contra_vouchers SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

DROP TRIGGER IF EXISTS trg_purchase_items_recalc_ins;
CREATE TRIGGER trg_purchase_items_recalc_ins
AFTER INSERT ON purchase_items
FOR EACH ROW
BEGIN
  UPDATE purchases
  SET
    subtotal = COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM purchase_items WHERE purchase_id = NEW.purchase_id AND deleted_at IS NULL), 0),
    total_amount = (
      COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM purchase_items WHERE purchase_id = NEW.purchase_id AND deleted_at IS NULL), 0)
      + CAST(COALESCE(charges_add, '0') AS REAL)
      - CAST(COALESCE(charges_less, '0') AS REAL)
      + CAST(COALESCE(tax_amount, '0') AS REAL)
    )
  WHERE id = NEW.purchase_id AND deleted_at IS NULL;
END;

DROP TRIGGER IF EXISTS trg_purchase_items_recalc_upd;
CREATE TRIGGER trg_purchase_items_recalc_upd
AFTER UPDATE ON purchase_items
FOR EACH ROW
BEGIN
  UPDATE purchases
  SET
    subtotal = COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM purchase_items WHERE purchase_id = NEW.purchase_id AND deleted_at IS NULL), 0),
    total_amount = (
      COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM purchase_items WHERE purchase_id = NEW.purchase_id AND deleted_at IS NULL), 0)
      + CAST(COALESCE(charges_add, '0') AS REAL)
      - CAST(COALESCE(charges_less, '0') AS REAL)
      + CAST(COALESCE(tax_amount, '0') AS REAL)
    )
  WHERE id = NEW.purchase_id AND deleted_at IS NULL;
END;

DROP TRIGGER IF EXISTS trg_purchase_items_recalc_del;
CREATE TRIGGER trg_purchase_items_recalc_del
AFTER DELETE ON purchase_items
FOR EACH ROW
BEGIN
  UPDATE purchases
  SET
    subtotal = COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM purchase_items WHERE purchase_id = OLD.purchase_id AND deleted_at IS NULL), 0),
    total_amount = (
      COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM purchase_items WHERE purchase_id = OLD.purchase_id AND deleted_at IS NULL), 0)
      + CAST(COALESCE(charges_add, '0') AS REAL)
      - CAST(COALESCE(charges_less, '0') AS REAL)
      + CAST(COALESCE(tax_amount, '0') AS REAL)
    )
  WHERE id = OLD.purchase_id AND deleted_at IS NULL;
END;

DROP TRIGGER IF EXISTS trg_sale_items_recalc_ins;
CREATE TRIGGER trg_sale_items_recalc_ins
AFTER INSERT ON sale_items
FOR EACH ROW
BEGIN
  UPDATE sales
  SET
    subtotal = COALESCE((SELECT SUM(CAST(total_price AS REAL)) FROM sale_items WHERE sale_id = NEW.sale_id), 0),
    total_amount = (
      COALESCE((SELECT SUM(CAST(total_price AS REAL)) FROM sale_items WHERE sale_id = NEW.sale_id), 0)
      + CAST(COALESCE(loading_charges, '0') AS REAL)
      + CAST(COALESCE(weighing_charges, '0') AS REAL)
      + CAST(COALESCE(other_charges, '0') AS REAL)
      + CAST(COALESCE(tax_amount, '0') AS REAL)
    )
  WHERE id = NEW.sale_id;
END;

DROP TRIGGER IF EXISTS trg_sale_items_recalc_upd;
CREATE TRIGGER trg_sale_items_recalc_upd
AFTER UPDATE ON sale_items
FOR EACH ROW
BEGIN
  UPDATE sales
  SET
    subtotal = COALESCE((SELECT SUM(CAST(total_price AS REAL)) FROM sale_items WHERE sale_id = NEW.sale_id), 0),
    total_amount = (
      COALESCE((SELECT SUM(CAST(total_price AS REAL)) FROM sale_items WHERE sale_id = NEW.sale_id), 0)
      + CAST(COALESCE(loading_charges, '0') AS REAL)
      + CAST(COALESCE(weighing_charges, '0') AS REAL)
      + CAST(COALESCE(other_charges, '0') AS REAL)
      + CAST(COALESCE(tax_amount, '0') AS REAL)
    )
  WHERE id = NEW.sale_id;
END;

DROP TRIGGER IF EXISTS trg_sale_items_recalc_del;
CREATE TRIGGER trg_sale_items_recalc_del
AFTER DELETE ON sale_items
FOR EACH ROW
BEGIN
  UPDATE sales
  SET
    subtotal = COALESCE((SELECT SUM(CAST(total_price AS REAL)) FROM sale_items WHERE sale_id = OLD.sale_id), 0),
    total_amount = (
      COALESCE((SELECT SUM(CAST(total_price AS REAL)) FROM sale_items WHERE sale_id = OLD.sale_id), 0)
      + CAST(COALESCE(loading_charges, '0') AS REAL)
      + CAST(COALESCE(weighing_charges, '0') AS REAL)
      + CAST(COALESCE(other_charges, '0') AS REAL)
      + CAST(COALESCE(tax_amount, '0') AS REAL)
    )
  WHERE id = OLD.sale_id;
END;

PRAGMA foreign_keys = ON;
