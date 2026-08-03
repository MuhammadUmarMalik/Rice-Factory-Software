import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, check, uniqueIndex, AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// These columns are declared `integer(..., { mode: "timestamp" })`, so the
// default must produce a Unix epoch *integer*. SQLite's CURRENT_TIMESTAMP
// returns the TEXT literal "YYYY-MM-DD HH:MM:SS", which SQLite stores verbatim
// (an INTEGER column keeps a non-numeric string as TEXT). Drizzle then read it
// back as `new Date(text * 1000)` -> Invalid Date, which serialises to null, so
// every defaulted timestamp reached the client as null.
const now = sql`(unixepoch())`;

// Users table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  fullNameUrdu: text("full_name_urdu"),
  role: text("role", { enum: ["admin", "manager", "accountant", "hr", "operator"] }).notNull().default("operator"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// FIXED: 1
// Accounts table (Customers, Suppliers, Banks, Expense Categories)
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameUrdu: text("name_urdu"),
  type: text("type", {
    enum: [
      "customer",
      "supplier",
      "bank",
      "expense",
      "asset",
      "liability",
      "equity",
      "income",
      "cogs",
      "salary",
      "employee",
      "broker",
    ],
  }).notNull(),
  parentId: integer("parent_id").references((): AnySQLiteColumn => accounts.id),
  level: integer("level").notNull().default(0),
  phone: text("phone"),
  address: text("address"),
  addressUrdu: text("address_urdu"),
  openingBalance: text("opening_balance").notNull().default("0"),
  currentBalance: text("current_balance").notNull().default("0"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSystemAccount: integer("is_system_account", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  currentBalance: true,
  createdAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

// FIXED: 28
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message"),
  type: text("type"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Fiscal Calendar (Company-level; single-company assumption)
export const fiscalYears = sqliteTable("fiscal_years", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g., FY-2025
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  endDate: integer("end_date", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["draft", "open", "closed"] }).notNull().default("draft"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

// FIXED: 4
export const fiscalPeriods = sqliteTable("fiscal_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fiscalYearId: integer("fiscal_year_id").notNull().references(() => fiscalYears.id, { onDelete: "cascade" }),
  yearMonth: text("year_month").notNull(), // YYYY-MM
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
  periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
  isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
  closedBy: integer("closed_by").references(() => users.id),
  closedAt: integer("closed_at", { mode: "timestamp" }),
}, (table) => ({
  uqFiscalPeriod: uniqueIndex("uq_fiscal_period").on(table.fiscalYearId, table.yearMonth),
}));

// FIXED: 5
export const fiscalOpeningBalances = sqliteTable("fiscal_opening_balances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fiscalYearId: integer("fiscal_year_id").notNull().references(() => fiscalYears.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  openingBalance: text("opening_balance").notNull().default("0"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
}, (table) => ({
  uqFob: uniqueIndex("uq_fob").on(table.fiscalYearId, table.accountId),
}));

// Tax Configuration & Compliance
export const taxTypes = sqliteTable("tax_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(), // e.g. GST, WHT
  direction: text("direction", { enum: ["sales", "purchases", "both"] }).notNull().default("both"),
  inputAccountId: integer("input_account_id").references(() => accounts.id), // tax receivable
  outputAccountId: integer("output_account_id").references(() => accounts.id), // tax payable
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

// FIXED: 2
export const taxRates = sqliteTable("tax_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taxTypeId: integer("tax_type_id").notNull().references(() => taxTypes.id, { onDelete: "cascade" }),
  ratePercent: text("rate_percent").notNull().default("0"),
  effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull().default(now),
  effectiveTo: integer("effective_to", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
}, (table) => ({
  uqTaxRatePeriod: uniqueIndex("uq_tax_rate_period").on(table.taxTypeId, table.effectiveFrom),
}));

// FIXED: 3
export const taxLedgers = sqliteTable("tax_ledgers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taxTypeId: integer("tax_type_id").notNull().references(() => taxTypes.id),
  saleId: integer("sale_id").references(() => sales.id),
  purchaseId: integer("purchase_id").references(() => purchases.id),
  taxBase: text("tax_base").notNull().default("0"),
  taxAmount: text("tax_amount").notNull().default("0"),
  postingDate: integer("posting_date", { mode: "timestamp" }).notNull().default(now),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
}, (table) => ({
  ckTaxLedgersSingleSource: check(
    "ck_tax_ledgers_single_source",
    sql`(${table.saleId} IS NULL) != (${table.purchaseId} IS NULL)`,
  ),
}));

export const insertTaxTypeSchema = createInsertSchema(taxTypes).omit({ id: true, createdAt: true });
export type InsertTaxType = z.infer<typeof insertTaxTypeSchema>;
export type TaxType = typeof taxTypes.$inferSelect;

export const insertTaxRateSchema = createInsertSchema(taxRates).omit({ id: true });
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxRate = typeof taxRates.$inferSelect;

// FIXED: 6
// Employees (HR Master)
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeCode: text("employee_code").notNull().unique(),
  name: text("name").notNull(),
  fatherName: text("father_name"),
  cnic: text("cnic"),
  phone: text("phone"),
  email: text("email"),
  designation: text("designation"),
  department: text("department"),
  joiningDate: integer("joining_date", { mode: "timestamp" }),
  employmentType: text("employment_type", { enum: ["permanent", "contract"] }).notNull().default("permanent"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  accountId: integer("account_id").references(() => accounts.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  employeeCode: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Salary Structure (history by effective date)
export const employeeSalaryStructures = sqliteTable("employee_salary_structures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  basicSalary: text("basic_salary").notNull().default("0"),
  allowances: text("allowances").notNull().default("0"),
  deductions: text("deductions").notNull().default("0"),
  grossSalary: text("gross_salary").notNull().default("0"),
  netSalary: text("net_salary").notNull().default("0"),
  allowancesJson: text("allowances_json"),
  deductionsJson: text("deductions_json"),
  effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertEmployeeSalaryStructureSchema = createInsertSchema(employeeSalaryStructures, {
  effectiveFrom: (schema) =>
    z.preprocess(
      (val) => (val === null || val === undefined || val === "" ? undefined : new Date(val as any)),
      z.date(),
    ),
}).omit({
  id: true,
  grossSalary: true,
  netSalary: true,
  createdAt: true,
});
export type InsertEmployeeSalaryStructure = z.infer<typeof insertEmployeeSalaryStructureSchema>;
export type EmployeeSalaryStructure = typeof employeeSalaryStructures.$inferSelect;

// FIXED: 7
// Payroll Processing
export const payrolls = sqliteTable("payrolls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollMonth: text("payroll_month").notNull(), // YYYY-MM
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  basicSalary: text("basic_salary").notNull().default("0"),
  allowances: text("allowances").notNull().default("0"),
  deductions: text("deductions").notNull().default("0"),
  netSalary: text("net_salary").notNull().default("0"),
  paymentMethod: text("payment_method", { enum: ["Cash", "Bank"] }),
  paymentAccountId: integer("payment_account_id").references(() => accounts.id),
  status: text("status", { enum: ["generated", "approved", "paid", "cancelled"] }).notNull().default("generated"),
  journalVoucherId: integer("journal_voucher_id").references(() => journalVouchers.id),
  paymentJournalVoucherId: integer("payment_journal_voucher_id").references(() => journalVouchers.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedByRole: text("approved_by_role"),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  paidAt: integer("paid_at", { mode: "timestamp" }),
}, (table) => ({
  uqPayrollEmployeeMonth: uniqueIndex("uq_payroll_employee_month").on(table.employeeId, table.payrollMonth),
}));

export const insertPayrollSchema = createInsertSchema(payrolls).omit({
  id: true,
  journalVoucherId: true,
  paymentJournalVoucherId: true,
  approvedBy: true,
  approvedByRole: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
});
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payrolls.$inferSelect;

export const payrollAuditLogs = sqliteTable("payroll_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollId: integer("payroll_id").notNull().references(() => payrolls.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // generated|approved|paid|updated
  performedBy: integer("performed_by").references(() => users.id),
  performedByRole: text("performed_by_role"),
  performedAt: integer("performed_at", { mode: "timestamp" }).notNull().default(now),
  detailsJson: text("details_json"),
});

export const insertPayrollAuditLogSchema = createInsertSchema(payrollAuditLogs).omit({
  id: true,
  performedAt: true,
});
export type InsertPayrollAuditLog = z.infer<typeof insertPayrollAuditLogSchema>;
export type PayrollAuditLog = typeof payrollAuditLogs.$inferSelect;

// Products table (Rice types)
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameUrdu: text("name_urdu"),
  productType: text("product_type", { enum: ["raw", "bio"] }).notNull().default("raw"),
  unit: text("unit").notNull().default("kg"),
  currentStock: text("current_stock").notNull().default("0"),
  avgPurchasePrice: text("avg_purchase_price").notNull().default("0"),
  salePrice: text("sale_price").notNull().default("0"),
  reorderLevel: text("reorder_level").notNull().default("10"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// FIXED: 8
// Purchases table
export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  billNo: text("bill_no"),
  bookNo: text("book_no"),
  supplierId: integer("supplier_id").notNull().references(() => accounts.id),
  expenseAccountId: integer("expense_account_id").references(() => accounts.id),
  vehicleNumber: text("vehicle_number"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  brokerId: integer("broker_id").references(() => accounts.id),
  brokerCommissionPercent: text("broker_commission_percent").default("0"),
  brokerCommissionAmount: text("broker_commission_amount").default("0"),
  subtotal: text("subtotal").notNull().default("0"), // line items subtotal
  totalAmount: text("total_amount").notNull().default("0"), // grand amount after charges
  totalBags: text("total_bags").notNull().default("0"),
  totalGrossWeightKg: text("total_gross_weight_kg").notNull().default("0"),
  totalNetWeightKg: text("total_net_weight_kg").notNull().default("0"),
  totalMoundQty: text("total_mound_qty").notNull().default("0"),
  totalMoundRemainderKg: text("total_mound_remainder_kg").notNull().default("0"),
  moundBaseKg: integer("mound_base_kg").notNull().default(40),
  chargesAdd: text("charges_add").notNull().default("0"),
  chargesLess: text("charges_less").notNull().default("0"),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxAmount: text("tax_amount").notNull().default("0"),
  buyerAmount: text("buyer_amount").notNull().default("0"),
  balanceDue: text("balance_due").notNull().default("0"),
  paidAmount: text("paid_amount").notNull().default("0"),
  notes: text("notes"),
  purchaseDate: integer("purchase_date", { mode: "timestamp" }).notNull().default(now),
  paymentMode: text("payment_mode").default("cash"),
  cashPaymentId: integer("cash_payment_id").references(() => cashPayments.id, { onDelete: "set null" }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  deletedBy: integer("deleted_by").references(() => users.id),
});

export const insertPurchaseSchema = createInsertSchema(purchases).omit({
  id: true,
  invoiceNumber: true,
  subtotal: true,
  totalAmount: true,
  createdAt: true,
});
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchases.$inferSelect;

// Purchase Items table
export const purchaseItems = sqliteTable("purchase_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  serialNo: integer("serial_no"),
  marka: text("marka"),
  bags: text("bags").notNull(),
  fillingPerBagKg: text("filling_per_bag_kg").notNull(),
  looseKgs: text("loose_kgs").notNull().default("0"),
  grossWeightKg: text("gross_weight_kg").notNull(),
  lessKg: text("less_kg").notNull().default("0"),
  bardanaKatKg: text("bardana_kat_kg").notNull().default("0"),
  netWeightKg: text("net_weight_kg").notNull(),
  moundQty: text("mound_qty").notNull(),
  moundRemainderKg: text("mound_remainder_kg").notNull().default("0"),
  rateUnit: text("rate_unit", { enum: ["kg", "mound", "bag", "quintal", "ton"] }).notNull().default("kg"),
  rate: text("rate").notNull(),
  amount: text("amount").notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  deletedBy: integer("deleted_by").references(() => users.id),
});

export const insertPurchaseItemSchema = createInsertSchema(purchaseItems).omit({
  id: true,
});
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItems.$inferSelect;

// Purchase Charges table
export const purchaseCharges = sqliteTable("purchase_charges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: [
      "weight",
      "freight",
      "loading_filling",
      "market_fee",
      "mitha_sukri",
      "other",
      "phone_analysis",
      "brokerage",
      "commission",
      "bardana",
      "broken_allowance",
      "accountant_clerk",
    ],
  }).notNull(),
  mode: text("mode", { enum: ["add", "less"] }).notNull().default("add"),
  amount: text("amount").notNull().default("0"),
  accountId: integer("account_id").references(() => accounts.id),
  note: text("note"),
});

export const insertPurchaseChargeSchema = createInsertSchema(purchaseCharges).omit({
  id: true,
});
export type InsertPurchaseCharge = z.infer<typeof insertPurchaseChargeSchema>;
export type PurchaseCharge = typeof purchaseCharges.$inferSelect;

// Processing table (Stock Processing)
export const processing = sqliteTable("processing", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchNumber: text("batch_number").notNull().unique(),
  sourceProductId: integer("source_product_id").notNull().references(() => products.id),
  sourceQuantity: text("source_quantity").notNull(),
  outputProductId: integer("output_product_id").references(() => products.id),
  outputCategory: text("output_category"),
  outputQuantity: text("output_quantity"),
  wastageQuantity: text("wastage_quantity"),
  status: text("status", { enum: ["pending", "in_progress", "completed"] }).notNull().default("pending"),
  notes: text("notes"),
  startDate: integer("start_date", { mode: "timestamp" }).notNull().default(now),
  completedDate: integer("completed_date", { mode: "timestamp" }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertProcessingSchema = createInsertSchema(processing).omit({
  id: true,
  batchNumber: true,
  createdAt: true,
});
export type InsertProcessing = z.infer<typeof insertProcessingSchema>;
export type Processing = typeof processing.$inferSelect;

// FIXED: 9
// Sales table
export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => accounts.id),
  vehicleNumber: text("vehicle_number"),
  loadingCharges: text("loading_charges").default("0"),
  weighingCharges: text("weighing_charges").default("0"),
  otherCharges: text("other_charges").default("0"),
  rentCharges: text("rent_charges").default("0"),
  discountAmount: text("discount_amount").default("0"),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxAmount: text("tax_amount").notNull().default("0"),
  subtotal: text("subtotal").notNull().default("0"),
  totalAmount: text("total_amount").notNull().default("0"),
  balanceDue: text("balance_due").notNull().default("0"),
  paidAmount: text("paid_amount").notNull().default("0"),
  notes: text("notes"),
  gatePassNumber: text("gate_pass_number"),
  saleDate: integer("sale_date", { mode: "timestamp" }).notNull().default(now),
  dueDate: integer("due_date", { mode: "timestamp" }),
  paymentMode: text("payment_mode").default("cash"),
  cashReceiptId: integer("cash_receipt_id").references(() => cashReceipts.id, { onDelete: "set null" }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertSaleSchema = createInsertSchema(sales).omit({
  id: true,
  invoiceNumber: true,
  gatePassNumber: true,
  subtotal: true,
  totalAmount: true,
  createdAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof sales.$inferSelect;

// Sale Items table
export const saleItems = sqliteTable("sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: text("quantity").notNull(),
  quantityKg: text("quantity_kg").notNull().default("0"),
  unit: text("unit").notNull().default("kg"),
  pricePerUnit: text("price_per_unit").notNull(),
  totalPrice: text("total_price").notNull(),
});

export const insertSaleItemSchema = createInsertSchema(saleItems).omit({
  id: true,
});
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type SaleItem = typeof saleItems.$inferSelect;

// FIXED: 10
// Ledger Entries table
export const ledgerEntries = sqliteTable("ledger_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  transactionType: text("transaction_type", { enum: ["debit", "credit"] }).notNull(),
  amount: text("amount").notNull(),
  balance: text("balance").notNull(),
  description: text("description").notNull(),
  descriptionUrdu: text("description_urdu"),
  saleId: integer("sale_id").references(() => sales.id),
  purchaseId: integer("purchase_id").references(() => purchases.id),
  receiptVoucherId: integer("receipt_voucher_id").references(() => receiptVouchers.id),
  journalVoucherId: integer("journal_voucher_id").references(() => journalVouchers.id),
  contraVoucherId: integer("contra_voucher_id").references(() => contraVouchers.id),
  expenseEntryId: integer("expense_entry_id").references(() => expenseEntries.id),
  entryDate: integer("entry_date", { mode: "timestamp" }).notNull().default(now),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
}, (table) => ({
  ckLedgerEntriesSingleRef: check(
    "ck_ledger_entries_single_ref",
    sql`(
      (CASE WHEN ${table.saleId} IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN ${table.purchaseId} IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN ${table.receiptVoucherId} IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN ${table.journalVoucherId} IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN ${table.contraVoucherId} IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN ${table.expenseEntryId} IS NOT NULL THEN 1 ELSE 0 END)
    ) = 1`,
  ),
}));

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

// FIXED: 11
// Cash Receipt Vouchers
export const receiptVouchers = sqliteTable("receipt_vouchers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNumber: text("voucher_number").notNull().unique(),
  voucherType: text("voucher_type", { enum: ["CR", "CP", "BR", "BP"] }).notNull().default("CR"),
  voucherDate: integer("voucher_date", { mode: "timestamp" }).notNull().default(now),
  settlementAccountId: integer("settlement_account_id").references(() => accounts.id), // cash/bank account used as counter-entry
  totalDebit: text("total_debit").notNull().default("0"),
  totalCredit: text("total_credit").notNull().default("0"),
  narration: text("narration"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const receiptVoucherLines = sqliteTable("receipt_voucher_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherId: integer("voucher_id").notNull().references(() => receiptVouchers.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  narration: text("narration"),
  debit: text("debit").notNull().default("0"),
  credit: text("credit").notNull().default("0"),
  saleId: integer("sale_id").references(() => sales.id),
  purchaseId: integer("purchase_id").references(() => purchases.id),
});

export const insertReceiptVoucherSchema = createInsertSchema(receiptVouchers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertReceiptVoucher = z.infer<typeof insertReceiptVoucherSchema>;
export type ReceiptVoucher = typeof receiptVouchers.$inferSelect;

export const insertReceiptVoucherLineSchema = createInsertSchema(receiptVoucherLines).omit({
  id: true,
});
export type InsertReceiptVoucherLine = z.infer<typeof insertReceiptVoucherLineSchema>;
export type ReceiptVoucherLine = typeof receiptVoucherLines.$inferSelect;

// FIXED: 12
// Journal Vouchers
export const journalVouchers = sqliteTable("journal_vouchers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNo: text("voucher_no").notNull().unique(),
  voucherDate: integer("voucher_date", { mode: "timestamp" }).notNull().default(now),
  totalAmount: text("total_amount").notNull().default("0"),
  narration: text("narration"),
  status: text("status", { enum: ["draft", "approved"] }).notNull().default("draft"),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
});

export const journalVoucherEntries = sqliteTable("journal_voucher_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  journalVoucherId: integer("journal_voucher_id").notNull().references(() => journalVouchers.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  entryType: text("entry_type", { enum: ["DEBIT", "CREDIT"] }).notNull(),
  amount: text("amount").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertJournalVoucherSchema = createInsertSchema(journalVouchers).omit({
  id: true,
  voucherNo: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJournalVoucher = z.infer<typeof insertJournalVoucherSchema>;
export type JournalVoucher = typeof journalVouchers.$inferSelect;

export const insertJournalVoucherEntrySchema = createInsertSchema(journalVoucherEntries).omit({
  id: true,
});
export type InsertJournalVoucherEntry = z.infer<typeof insertJournalVoucherEntrySchema>;
export type JournalVoucherEntry = typeof journalVoucherEntries.$inferSelect;

// FIXED: 13
// Cash Transactions
export const cashTransactions = sqliteTable("cash_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  transactionDate: integer("transaction_date", { mode: "timestamp" }).notNull().default(now),
  transactionType: text("transaction_type", { enum: ["DEBIT", "CREDIT"] }).notNull(),
  journalVoucherId: integer("journal_voucher_id").references(() => journalVouchers.id),
  receiptVoucherId: integer("receipt_voucher_id").references(() => receiptVouchers.id),
  contraVoucherId: integer("contra_voucher_id").references(() => contraVouchers.id),
  expenseEntryId: integer("expense_entry_id").references(() => expenseEntries.id),
  amount: text("amount").notNull(),
  narration: text("narration"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  deletedBy: integer("deleted_by").references(() => users.id),
});

export const insertCashTransactionSchema = createInsertSchema(cashTransactions).omit({
  id: true,
  createdAt: true,
});
export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;
export type CashTransaction = typeof cashTransactions.$inferSelect;

// Period Locks (posting restrictions)
export const periodLocks = sqliteTable("period_locks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromDate: integer("from_date", { mode: "timestamp" }).notNull(),
  toDate: integer("to_date", { mode: "timestamp" }).notNull(),
  reason: text("reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertPeriodLockSchema = createInsertSchema(periodLocks).omit({
  id: true,
  createdAt: true,
});
export type InsertPeriodLock = z.infer<typeof insertPeriodLockSchema>;
export type PeriodLock = typeof periodLocks.$inferSelect;

// Contra Vouchers (cash<->bank, bank<->bank)
export const contraVouchers = sqliteTable("contra_vouchers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNo: text("voucher_no").notNull().unique(),
  voucherDate: integer("voucher_date", { mode: "timestamp" }).notNull().default(now),
  narration: text("narration"),
  status: text("status", { enum: ["draft", "approved"] }).notNull().default("draft"),
  totalAmount: text("total_amount").notNull().default("0"),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
});

export const contraVoucherLines = sqliteTable("contra_voucher_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contraVoucherId: integer("contra_voucher_id").notNull().references(() => contraVouchers.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  entryType: text("entry_type", { enum: ["DEBIT", "CREDIT"] }).notNull(),
  amount: text("amount").notNull().default("0"),
});

export const insertContraVoucherSchema = createInsertSchema(contraVouchers).omit({
  id: true,
  voucherNo: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContraVoucher = z.infer<typeof insertContraVoucherSchema>;
export type ContraVoucher = typeof contraVouchers.$inferSelect;

export const insertContraVoucherLineSchema = createInsertSchema(contraVoucherLines).omit({
  id: true,
});
export type InsertContraVoucherLine = z.infer<typeof insertContraVoucherLineSchema>;
export type ContraVoucherLine = typeof contraVoucherLines.$inferSelect;

// Fixed Assets
export const assetCategories = sqliteTable("asset_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  depreciationMethod: text("depreciation_method", { enum: ["SLM", "WDV"] }).notNull().default("SLM"),
  depreciationRateAnnual: text("depreciation_rate_annual").notNull().default("0"), // percent
  assetAccountId: integer("asset_account_id").references(() => accounts.id), // optional override
  accumulatedDepreciationAccountId: integer("accumulated_depreciation_account_id").references(() => accounts.id),
  depreciationExpenseAccountId: integer("depreciation_expense_account_id").references(() => accounts.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const fixedAssets = sqliteTable("fixed_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetCode: text("asset_code").notNull().unique(),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull().references(() => assetCategories.id),
  acquisitionDate: integer("acquisition_date", { mode: "timestamp" }).notNull(),
  acquisitionCost: text("acquisition_cost").notNull().default("0"),
  salvageValue: text("salvage_value").notNull().default("0"),
  usefulLifeMonths: integer("useful_life_months").notNull().default(0),
  disposedAt: integer("disposed_at", { mode: "timestamp" }),
  disposalProceeds: text("disposal_proceeds").notNull().default("0"),
  disposalNotes: text("disposal_notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const assetDepreciationRuns = sqliteTable("asset_depreciation_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // FIXED: 14
  fiscalPeriodId: integer("fiscal_period_id").notNull().references(() => fiscalPeriods.id),
  runMonth: text("run_month").notNull(), // YYYY-MM
  runDate: integer("run_date", { mode: "timestamp" }).notNull().default(now),
  journalVoucherId: integer("journal_voucher_id").references(() => journalVouchers.id),
  status: text("status", { enum: ["draft", "posted"] }).notNull().default("draft"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertAssetCategorySchema = createInsertSchema(assetCategories).omit({ id: true, createdAt: true });
export type InsertAssetCategory = z.infer<typeof insertAssetCategorySchema>;
export type AssetCategory = typeof assetCategories.$inferSelect;

export const insertFixedAssetSchema = createInsertSchema(fixedAssets).omit({ id: true, assetCode: true, createdAt: true });
export type InsertFixedAsset = z.infer<typeof insertFixedAssetSchema>;
export type FixedAsset = typeof fixedAssets.$inferSelect;

export const insertAssetDepreciationRunSchema = createInsertSchema(assetDepreciationRuns).omit({
  id: true,
  createdAt: true,
  journalVoucherId: true,
});
export type InsertAssetDepreciationRun = z.infer<typeof insertAssetDepreciationRunSchema>;
export type AssetDepreciationRun = typeof assetDepreciationRuns.$inferSelect;

// Bank Reconciliation
export const bankStatements = sqliteTable("bank_statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bankAccountId: integer("bank_account_id").notNull().references(() => accounts.id),
  statementFrom: integer("statement_from", { mode: "timestamp" }).notNull(),
  statementTo: integer("statement_to", { mode: "timestamp" }).notNull(),
  reference: text("reference"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const bankStatementLines = sqliteTable("bank_statement_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statementId: integer("statement_id").notNull().references(() => bankStatements.id, { onDelete: "cascade" }),
  txDate: integer("tx_date", { mode: "timestamp" }).notNull(),
  description: text("description").notNull().default(""),
  debit: text("debit").notNull().default("0"),
  credit: text("credit").notNull().default("0"),
  amount: text("amount").notNull().default("0"), // signed convenience (debit - credit) from bank perspective
  externalRef: text("external_ref"),
});

// FIXED: 15
export const bankReconciliationItems = sqliteTable("bank_reconciliation_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bankAccountId: integer("bank_account_id").notNull().references(() => accounts.id),
  statementLineId: integer("statement_line_id").references(() => bankStatementLines.id, { onDelete: "cascade" }),
  ledgerEntryId: integer("ledger_entry_id").references(() => ledgerEntries.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["matched", "unmatched"] }).notNull().default("unmatched"),
  matchedAt: integer("matched_at", { mode: "timestamp" }),
  matchedBy: integer("matched_by").references(() => users.id),
}, (table) => ({
  uqBriStmtLine: uniqueIndex("uq_bri_stmt_line").on(table.statementLineId),
  uqBriLedger: uniqueIndex("uq_bri_ledger").on(table.ledgerEntryId),
}));

// FIXED: 16
// AR/AP Allocations (invoice settlement)
export const invoiceAllocations = sqliteTable("invoice_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").references(() => sales.id),
  purchaseId: integer("purchase_id").references(() => purchases.id),
  receiptVoucherId: integer("receipt_voucher_id").references(() => receiptVouchers.id),
  paymentVoucherId: integer("payment_voucher_id").references(() => contraVouchers.id),
  allocationDate: integer("allocation_date", { mode: "timestamp" }).notNull().default(now),
  amount: text("amount").notNull().default("0"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
}, (table) => ({
  ckInvoiceAllocInvoice: check(
    "ck_invoice_alloc_invoice",
    sql`${table.saleId} IS NOT NULL OR ${table.purchaseId} IS NOT NULL`,
  ),
  ckInvoiceAllocVoucher: check(
    "ck_invoice_alloc_voucher",
    sql`${table.receiptVoucherId} IS NOT NULL OR ${table.paymentVoucherId} IS NOT NULL`,
  ),
}));

// System-wide Audit Trail
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity: text("entity").notNull(), // e.g., purchase, sale, journal_voucher
  entityId: integer("entity_id"),
  action: text("action").notNull(), // create|update|delete|approve|post|close
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  performedBy: integer("performed_by").references(() => users.id),
  performedByRole: text("performed_by_role"),
  performedAt: integer("performed_at", { mode: "timestamp" }).notNull().default(now),
  source: text("source").notNull().default("api"),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, performedAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Budgeting (Phase 1)
export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  fiscalYearId: integer("fiscal_year_id").references(() => fiscalYears.id),
  status: text("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

// FIXED: 17
export const budgetLines = sqliteTable("budget_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  budgetId: integer("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  yearMonth: text("year_month").notNull(), // YYYY-MM
  amount: text("amount").notNull().default("0"),
}, (table) => ({
  uqBudgetLine: uniqueIndex("uq_budget_line").on(table.budgetId, table.accountId, table.yearMonth),
}));

export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true, createdAt: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgets.$inferSelect;

export const insertBudgetLineSchema = createInsertSchema(budgetLines).omit({ id: true });
export type InsertBudgetLine = z.infer<typeof insertBudgetLineSchema>;
export type BudgetLine = typeof budgetLines.$inferSelect;

// Expense Entries (direct expenses)
export const expenseEntries = sqliteTable("expense_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNo: text("voucher_no").notNull().unique(),
  expenseAccountId: integer("expense_account_id").notNull().references(() => accounts.id),
  payFromAccountId: integer("pay_from_account_id").notNull().references(() => accounts.id),
  amount: text("amount").notNull().default("0"),
  description: text("description"),
  expenseDate: integer("expense_date", { mode: "timestamp" }).notNull().default(now),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertExpenseEntrySchema = createInsertSchema(expenseEntries).omit({
  id: true,
  voucherNo: true,
  createdAt: true,
});
export type InsertExpenseEntry = z.infer<typeof insertExpenseEntrySchema>;
export type ExpenseEntry = typeof expenseEntries.$inferSelect;

// Cash in Hand module tables
export const cashAccounts = sqliteTable("cash_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountName: text("account_name").notNull().default("Main Cash"),
  openingBalance: text("opening_balance").notNull().default("0"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const cashReceipts = sqliteTable("cash_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNo: text("voucher_no").notNull().unique(),
  receiptDate: integer("receipt_date", { mode: "timestamp" }).notNull(),
  receivedFrom: text("received_from").notNull(),
  amount: text("amount").notNull(),
  description: text("description"),
  paymentMode: text("payment_mode").default("cash"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  cashAccountId: integer("cash_account_id").notNull().default(1).references(() => cashAccounts.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const cashPayments = sqliteTable("cash_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNo: text("voucher_no").notNull().unique(),
  paymentDate: integer("payment_date", { mode: "timestamp" }).notNull(),
  paidTo: text("paid_to").notNull(),
  amount: text("amount").notNull(),
  description: text("description"),
  paymentMode: text("payment_mode").default("cash"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  cashAccountId: integer("cash_account_id").notNull().default(1).references(() => cashAccounts.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const cashJournalVouchers = sqliteTable("cash_journal_vouchers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNo: text("voucher_no").notNull().unique(),
  voucherDate: integer("voucher_date", { mode: "timestamp" }).notNull().default(now),
  narration: text("narration"),
  totalDebit: text("total_debit").notNull().default("0"),
  totalCredit: text("total_credit").notNull().default("0"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const cashJournalItems = sqliteTable("cash_journal_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  journalId: integer("journal_id").notNull().references(() => cashJournalVouchers.id, { onDelete: "cascade" }),
  accountHead: text("account_head").notNull(),
  debitAmount: text("debit_amount").notNull().default("0"),
  creditAmount: text("credit_amount").notNull().default("0"),
  narration: text("narration"),
});

export const insertCashAccountSchema = createInsertSchema(cashAccounts).omit({ id: true, createdAt: true });
export type InsertCashAccount = z.infer<typeof insertCashAccountSchema>;
export type CashAccount = typeof cashAccounts.$inferSelect;

export const insertCashReceiptSchema = createInsertSchema(cashReceipts).omit({ id: true, createdAt: true });
export type InsertCashReceipt = z.infer<typeof insertCashReceiptSchema>;
export type CashReceipt = typeof cashReceipts.$inferSelect;

export const insertCashPaymentSchema = createInsertSchema(cashPayments).omit({ id: true, createdAt: true });
export type InsertCashPayment = z.infer<typeof insertCashPaymentSchema>;
export type CashPayment = typeof cashPayments.$inferSelect;

export const insertCashJournalVoucherSchema = createInsertSchema(cashJournalVouchers).omit({
  id: true,
  totalDebit: true,
  totalCredit: true,
  createdAt: true,
});
export type InsertCashJournalVoucher = z.infer<typeof insertCashJournalVoucherSchema>;
export type CashJournalVoucher = typeof cashJournalVouchers.$inferSelect;

export const insertCashJournalItemSchema = createInsertSchema(cashJournalItems).omit({ id: true });
export type InsertCashJournalItem = z.infer<typeof insertCashJournalItemSchema>;
export type CashJournalItem = typeof cashJournalItems.$inferSelect;

// Specialized Daybooks
export const salesDaybook = sqliteTable("sales_daybook", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // FIXED: 18
  saleId: integer("sale_id").references(() => sales.id),
  transactionDate: integer("transaction_date", { mode: "timestamp" }).notNull().default(now),
  invoiceNumber: text("invoice_number").notNull(), // legacy
  customerId: integer("customer_id").references(() => accounts.id),
  customerName: text("customer_name").notNull(),
  customerAccountDetails: text("customer_account_details"),
  description: text("description"),
  quantity: text("quantity").notNull().default("0"),
  unitPrice: text("unit_price").notNull().default("0"),
  subtotalAmount: text("subtotal_amount").notNull().default("0"),
  taxAmount: text("tax_amount").notNull().default("0"),
  totalAmount: text("total_amount").notNull().default("0"),
  paymentTerms: text("payment_terms"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  paidAmount: text("paid_amount").notNull().default("0"),
  status: text("status", { enum: ["pending", "partially_paid", "fully_paid"] }).notNull().default("pending"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  migrationDate: integer("migration_date", { mode: "timestamp" }),
});

export const purchasesDaybook = sqliteTable("purchases_daybook", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // FIXED: 19
  purchaseId: integer("purchase_id").references(() => purchases.id),
  transactionDate: integer("transaction_date", { mode: "timestamp" }).notNull().default(now),
  invoiceNumber: text("invoice_number").notNull(), // legacy
  supplierId: integer("supplier_id").references(() => accounts.id),
  supplierName: text("supplier_name").notNull(),
  supplierAccountDetails: text("supplier_account_details"),
  description: text("description"),
  quantity: text("quantity").notNull().default("0"),
  unitPrice: text("unit_price").notNull().default("0"),
  subtotalAmount: text("subtotal_amount").notNull().default("0"),
  taxAmount: text("tax_amount").notNull().default("0"),
  totalAmount: text("total_amount").notNull().default("0"),
  paymentTerms: text("payment_terms"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  paidAmount: text("paid_amount").notNull().default("0"),
  status: text("status", { enum: ["pending", "partially_paid", "fully_paid"] }).notNull().default("pending"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  migrationDate: integer("migration_date", { mode: "timestamp" }),
});

export const cashBook = sqliteTable("cash_book", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // FIXED: 20
  receiptVoucherId: integer("receipt_voucher_id").references(() => receiptVouchers.id),
  contraVoucherId: integer("contra_voucher_id").references(() => contraVouchers.id),
  transactionDate: integer("transaction_date", { mode: "timestamp" }).notNull().default(now),
  transactionType: text("transaction_type", { enum: ["receipt", "payment"] }).notNull(),
  accountType: text("account_type", { enum: ["cash", "bank"] }).notNull(),
  bankAccountId: integer("bank_account_id").references(() => accounts.id),
  bankAccountName: text("bank_account_name"),
  referenceNumber: text("reference_number"),
  partyName: text("party_name"),
  description: text("description"),
  amount: text("amount").notNull().default("0"),
  category: text("category"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  migrationDate: integer("migration_date", { mode: "timestamp" }),
});

export const salesReturnsDaybook = sqliteTable("sales_returns_daybook", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // FIXED: 21
  saleId: integer("sale_id").references(() => sales.id),
  returnDate: integer("return_date", { mode: "timestamp" }).notNull().default(now),
  creditNoteNumber: text("credit_note_number").notNull(),
  originalInvoiceReference: text("original_invoice_reference"),
  customerId: integer("customer_id").references(() => accounts.id),
  customerName: text("customer_name").notNull(),
  description: text("description"),
  quantityReturned: text("quantity_returned").notNull().default("0"),
  reason: text("reason"),
  returnAmount: text("return_amount").notNull().default("0"),
  taxAdjustment: text("tax_adjustment").notNull().default("0"),
  totalCreditAmount: text("total_credit_amount").notNull().default("0"),
  status: text("status", { enum: ["pending", "processed", "refunded"] }).notNull().default("pending"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  migrationDate: integer("migration_date", { mode: "timestamp" }),
});

export const purchaseReturnsDaybook = sqliteTable("purchase_returns_daybook", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // FIXED: 22
  purchaseId: integer("purchase_id").references(() => purchases.id),
  returnDate: integer("return_date", { mode: "timestamp" }).notNull().default(now),
  debitNoteNumber: text("debit_note_number").notNull(),
  originalPurchaseReference: text("original_purchase_reference"),
  supplierId: integer("supplier_id").references(() => accounts.id),
  supplierName: text("supplier_name").notNull(),
  description: text("description"),
  quantityReturned: text("quantity_returned").notNull().default("0"),
  reason: text("reason"),
  returnAmount: text("return_amount").notNull().default("0"),
  taxAdjustment: text("tax_adjustment").notNull().default("0"),
  totalDebitAmount: text("total_debit_amount").notNull().default("0"),
  status: text("status", { enum: ["pending", "processed", "credited"] }).notNull().default("pending"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  migrationDate: integer("migration_date", { mode: "timestamp" }),
});

// FIXED: 23
// @deprecated legacy journal layer retained for migration compatibility
export const generalJournal = sqliteTable("general_journal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  journalVoucherId: integer("journal_voucher_id").references(() => journalVouchers.id),
  transactionDate: integer("transaction_date", { mode: "timestamp" }).notNull().default(now),
  journalEntryNumber: text("journal_entry_number").notNull().unique(),
  description: text("description").notNull(),
  entryType: text("entry_type"),
  totalDebits: text("total_debits").notNull().default("0"),
  totalCredits: text("total_credits").notNull().default("0"),
  status: text("status", { enum: ["draft", "approved", "reversed", "cancelled"] }).notNull().default("draft"),
  approvedBy: integer("approved_by").references(() => users.id),
  attachmentPaths: text("attachment_paths"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  migrationDate: integer("migration_date", { mode: "timestamp" }),
});

// FIXED: 24
// @deprecated legacy journal lines retained for migration compatibility
export const journalLines = sqliteTable("journal_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  journalId: integer("journal_id").notNull().references(() => generalJournal.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  accountName: text("account_name").notNull(),
  debitAmount: text("debit_amount").notNull().default("0"),
  creditAmount: text("credit_amount").notNull().default("0"),
  lineDescription: text("line_description"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
});

export const daybookAuditLogs = sqliteTable("daybook_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  daybookType: text("daybook_type").notNull(),
  recordId: integer("record_id").notNull(),
  action: text("action").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: integer("changed_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertSalesDaybookSchema = createInsertSchema(salesDaybook).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
export type InsertSalesDaybook = z.infer<typeof insertSalesDaybookSchema>;
export type SalesDaybook = typeof salesDaybook.$inferSelect;

export const insertPurchasesDaybookSchema = createInsertSchema(purchasesDaybook).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
export type InsertPurchasesDaybook = z.infer<typeof insertPurchasesDaybookSchema>;
export type PurchasesDaybook = typeof purchasesDaybook.$inferSelect;

export const insertCashBookSchema = createInsertSchema(cashBook).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
export type InsertCashBook = z.infer<typeof insertCashBookSchema>;
export type CashBook = typeof cashBook.$inferSelect;

export const insertSalesReturnsDaybookSchema = createInsertSchema(salesReturnsDaybook).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
export type InsertSalesReturnsDaybook = z.infer<typeof insertSalesReturnsDaybookSchema>;
export type SalesReturnsDaybook = typeof salesReturnsDaybook.$inferSelect;

export const insertPurchaseReturnsDaybookSchema = createInsertSchema(purchaseReturnsDaybook).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
export type InsertPurchaseReturnsDaybook = z.infer<typeof insertPurchaseReturnsDaybookSchema>;
export type PurchaseReturnsDaybook = typeof purchaseReturnsDaybook.$inferSelect;

export const insertGeneralJournalSchema = createInsertSchema(generalJournal).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
export type InsertGeneralJournal = z.infer<typeof insertGeneralJournalSchema>;
export type GeneralJournal = typeof generalJournal.$inferSelect;

export const insertJournalLineSchema = createInsertSchema(journalLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
export type InsertJournalLine = z.infer<typeof insertJournalLineSchema>;
export type JournalLine = typeof journalLines.$inferSelect;

export const insertDaybookAuditLogSchema = createInsertSchema(daybookAuditLogs).omit({
  id: true,
  changedAt: true,
});
export type InsertDaybookAuditLog = z.infer<typeof insertDaybookAuditLogSchema>;
export type DaybookAuditLog = typeof daybookAuditLogs.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  notifications: many(notifications),
  purchases: many(purchases),
  sales: many(sales),
  processing: many(processing),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  purchases: many(purchases),
  sales: many(sales),
  ledgerEntries: many(ledgerEntries),
  // FIXED: 25
  expenseEntriesAsExpense: many(expenseEntries, { relationName: "expenseAccount" }),
  expenseEntriesAsPayFrom: many(expenseEntries, { relationName: "payFromAccount" }),
}));

// FIXED: 26
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const taxTypesRelations = relations(taxTypes, ({ one, many }) => ({
  rates: many(taxRates),
  ledgers: many(taxLedgers),
  inputAccount: one(accounts, {
    fields: [taxTypes.inputAccountId],
    references: [accounts.id],
    relationName: "taxTypeInputAccount",
  }),
  outputAccount: one(accounts, {
    fields: [taxTypes.outputAccountId],
    references: [accounts.id],
    relationName: "taxTypeOutputAccount",
  }),
}));

export const taxRatesRelations = relations(taxRates, ({ one }) => ({
  taxType: one(taxTypes, {
    fields: [taxRates.taxTypeId],
    references: [taxTypes.id],
  }),
}));

export const taxLedgersRelations = relations(taxLedgers, ({ one }) => ({
  taxType: one(taxTypes, {
    fields: [taxLedgers.taxTypeId],
    references: [taxTypes.id],
  }),
  sale: one(sales, {
    fields: [taxLedgers.saleId],
    references: [sales.id],
  }),
  purchase: one(purchases, {
    fields: [taxLedgers.purchaseId],
    references: [purchases.id],
  }),
}));

export const fiscalYearsRelations = relations(fiscalYears, ({ one, many }) => ({
  periods: many(fiscalPeriods),
  openingBalances: many(fiscalOpeningBalances),
  budgets: many(budgets),
  createdByUser: one(users, {
    fields: [fiscalYears.createdBy],
    references: [users.id],
  }),
}));

export const fiscalPeriodsRelations = relations(fiscalPeriods, ({ one, many }) => ({
  fiscalYear: one(fiscalYears, {
    fields: [fiscalPeriods.fiscalYearId],
    references: [fiscalYears.id],
  }),
  assetDepreciationRuns: many(assetDepreciationRuns),
  closedByUser: one(users, {
    fields: [fiscalPeriods.closedBy],
    references: [users.id],
  }),
}));

export const fiscalOpeningBalancesRelations = relations(fiscalOpeningBalances, ({ one }) => ({
  fiscalYear: one(fiscalYears, {
    fields: [fiscalOpeningBalances.fiscalYearId],
    references: [fiscalYears.id],
  }),
  account: one(accounts, {
    fields: [fiscalOpeningBalances.accountId],
    references: [accounts.id],
  }),
  createdByUser: one(users, {
    fields: [fiscalOpeningBalances.createdBy],
    references: [users.id],
  }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  account: one(accounts, { fields: [employees.accountId], references: [accounts.id] }),
  salaryStructures: many(employeeSalaryStructures),
  payrolls: many(payrolls),
}));

export const employeeSalaryStructuresRelations = relations(employeeSalaryStructures, ({ one }) => ({
  employee: one(employees, { fields: [employeeSalaryStructures.employeeId], references: [employees.id] }),
}));

export const payrollsRelations = relations(payrolls, ({ one, many }) => ({
  employee: one(employees, { fields: [payrolls.employeeId], references: [employees.id] }),
  journalVoucher: one(journalVouchers, {
    fields: [payrolls.journalVoucherId],
    references: [journalVouchers.id],
    relationName: "payrollJV",
  }),
  paymentJournalVoucher: one(journalVouchers, {
    fields: [payrolls.paymentJournalVoucherId],
    references: [journalVouchers.id],
    relationName: "paymentJV",
  }),
  paymentAccount: one(accounts, { fields: [payrolls.paymentAccountId], references: [accounts.id] }),
  auditLogs: many(payrollAuditLogs),
}));

export const payrollAuditLogsRelations = relations(payrollAuditLogs, ({ one }) => ({
  payroll: one(payrolls, { fields: [payrollAuditLogs.payrollId], references: [payrolls.id] }),
  performedByUser: one(users, {
    fields: [payrollAuditLogs.performedBy],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  purchaseItems: many(purchaseItems),
  saleItems: many(saleItems),
  processingSource: many(processing),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(accounts, {
    fields: [purchases.supplierId],
    references: [accounts.id],
  }),
  expenseAccount: one(accounts, {
    fields: [purchases.expenseAccountId],
    references: [accounts.id],
  }),
  broker: one(accounts, {
    fields: [purchases.brokerId],
    references: [accounts.id],
  }),
  taxType: one(taxTypes, {
    fields: [purchases.taxTypeId],
    references: [taxTypes.id],
  }),
  createdByUser: one(users, {
    fields: [purchases.createdBy],
    references: [users.id],
  }),
  items: many(purchaseItems),
  charges: many(purchaseCharges),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
  product: one(products, {
    fields: [purchaseItems.productId],
    references: [products.id],
  }),
}));

export const purchaseChargesRelations = relations(purchaseCharges, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseCharges.purchaseId],
    references: [purchases.id],
  }),
  account: one(accounts, {
    fields: [purchaseCharges.accountId],
    references: [accounts.id],
  }),
}));

export const processingRelations = relations(processing, ({ one }) => ({
  sourceProduct: one(products, {
    fields: [processing.sourceProductId],
    references: [products.id],
  }),
  outputProduct: one(products, {
    fields: [processing.outputProductId],
    references: [products.id],
  }),
  createdByUser: one(users, {
    fields: [processing.createdBy],
    references: [users.id],
  }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(accounts, {
    fields: [sales.customerId],
    references: [accounts.id],
  }),
  taxType: one(taxTypes, {
    fields: [sales.taxTypeId],
    references: [taxTypes.id],
  }),
  createdByUser: one(users, {
    fields: [sales.createdBy],
    references: [users.id],
  }),
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  account: one(accounts, {
    fields: [ledgerEntries.accountId],
    references: [accounts.id],
  }),
  sale: one(sales, {
    fields: [ledgerEntries.saleId],
    references: [sales.id],
  }),
  purchase: one(purchases, {
    fields: [ledgerEntries.purchaseId],
    references: [purchases.id],
  }),
  receiptVoucher: one(receiptVouchers, {
    fields: [ledgerEntries.receiptVoucherId],
    references: [receiptVouchers.id],
  }),
  journalVoucher: one(journalVouchers, {
    fields: [ledgerEntries.journalVoucherId],
    references: [journalVouchers.id],
  }),
  contraVoucher: one(contraVouchers, {
    fields: [ledgerEntries.contraVoucherId],
    references: [contraVouchers.id],
  }),
  expenseEntry: one(expenseEntries, {
    fields: [ledgerEntries.expenseEntryId],
    references: [expenseEntries.id],
  }),
}));

export const receiptVouchersRelations = relations(receiptVouchers, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [receiptVouchers.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [receiptVouchers.updatedBy],
    references: [users.id],
  }),
  settlementAccount: one(accounts, {
    fields: [receiptVouchers.settlementAccountId],
    references: [accounts.id],
  }),
  lines: many(receiptVoucherLines),
}));

export const receiptVoucherLinesRelations = relations(receiptVoucherLines, ({ one }) => ({
  voucher: one(receiptVouchers, {
    fields: [receiptVoucherLines.voucherId],
    references: [receiptVouchers.id],
  }),
  account: one(accounts, {
    fields: [receiptVoucherLines.accountId],
    references: [accounts.id],
  }),
  sale: one(sales, {
    fields: [receiptVoucherLines.saleId],
    references: [sales.id],
  }),
  purchase: one(purchases, {
    fields: [receiptVoucherLines.purchaseId],
    references: [purchases.id],
  }),
}));

export const journalVouchersRelations = relations(journalVouchers, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [journalVouchers.createdBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [journalVouchers.approvedBy],
    references: [users.id],
  }),
  entries: many(journalVoucherEntries),
  payrolls: many(payrolls, { relationName: "payrollJV" }),
  paymentPayrolls: many(payrolls, { relationName: "paymentJV" }),
}));

export const journalVoucherEntriesRelations = relations(journalVoucherEntries, ({ one }) => ({
  voucher: one(journalVouchers, {
    fields: [journalVoucherEntries.journalVoucherId],
    references: [journalVouchers.id],
  }),
  account: one(accounts, {
    fields: [journalVoucherEntries.accountId],
    references: [accounts.id],
  }),
}));

export const cashTransactionsRelations = relations(cashTransactions, ({ one }) => ({
  account: one(accounts, {
    fields: [cashTransactions.accountId],
    references: [accounts.id],
  }),
  journalVoucher: one(journalVouchers, {
    fields: [cashTransactions.journalVoucherId],
    references: [journalVouchers.id],
  }),
  receiptVoucher: one(receiptVouchers, {
    fields: [cashTransactions.receiptVoucherId],
    references: [receiptVouchers.id],
  }),
  contraVoucher: one(contraVouchers, {
    fields: [cashTransactions.contraVoucherId],
    references: [contraVouchers.id],
  }),
  expenseEntry: one(expenseEntries, {
    fields: [cashTransactions.expenseEntryId],
    references: [expenseEntries.id],
  }),
}));

export const expenseEntriesRelations = relations(expenseEntries, ({ one }) => ({
  expenseAccount: one(accounts, {
    fields: [expenseEntries.expenseAccountId],
    references: [accounts.id],
    relationName: "expenseAccount",
  }),
  payFromAccount: one(accounts, {
    fields: [expenseEntries.payFromAccountId],
    references: [accounts.id],
    relationName: "payFromAccount",
  }),
  createdByUser: one(users, {
    fields: [expenseEntries.createdBy],
    references: [users.id],
  }),
}));

export const periodLocksRelations = relations(periodLocks, ({ one }) => ({
  createdByUser: one(users, {
    fields: [periodLocks.createdBy],
    references: [users.id],
  }),
}));

export const contraVouchersRelations = relations(contraVouchers, ({ one, many }) => ({
  lines: many(contraVoucherLines),
  createdByUser: one(users, {
    fields: [contraVouchers.createdBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [contraVouchers.approvedBy],
    references: [users.id],
  }),
}));

export const contraVoucherLinesRelations = relations(contraVoucherLines, ({ one }) => ({
  contraVoucher: one(contraVouchers, {
    fields: [contraVoucherLines.contraVoucherId],
    references: [contraVouchers.id],
  }),
  account: one(accounts, {
    fields: [contraVoucherLines.accountId],
    references: [accounts.id],
  }),
}));

export const assetCategoriesRelations = relations(assetCategories, ({ one, many }) => ({
  fixedAssets: many(fixedAssets),
  assetAccount: one(accounts, {
    fields: [assetCategories.assetAccountId],
    references: [accounts.id],
    relationName: "assetAccount",
  }),
  accDepAccount: one(accounts, {
    fields: [assetCategories.accumulatedDepreciationAccountId],
    references: [accounts.id],
    relationName: "accDepAccount",
  }),
  depExpAccount: one(accounts, {
    fields: [assetCategories.depreciationExpenseAccountId],
    references: [accounts.id],
    relationName: "depExpAccount",
  }),
}));

export const fixedAssetsRelations = relations(fixedAssets, ({ one }) => ({
  category: one(assetCategories, {
    fields: [fixedAssets.categoryId],
    references: [assetCategories.id],
  }),
  createdByUser: one(users, {
    fields: [fixedAssets.createdBy],
    references: [users.id],
  }),
}));

export const assetDepreciationRunsRelations = relations(assetDepreciationRuns, ({ one }) => ({
  fiscalPeriod: one(fiscalPeriods, {
    fields: [assetDepreciationRuns.fiscalPeriodId],
    references: [fiscalPeriods.id],
  }),
  journalVoucher: one(journalVouchers, {
    fields: [assetDepreciationRuns.journalVoucherId],
    references: [journalVouchers.id],
  }),
  createdByUser: one(users, {
    fields: [assetDepreciationRuns.createdBy],
    references: [users.id],
  }),
}));

export const bankStatementsRelations = relations(bankStatements, ({ one, many }) => ({
  bankAccount: one(accounts, {
    fields: [bankStatements.bankAccountId],
    references: [accounts.id],
  }),
  lines: many(bankStatementLines),
  createdByUser: one(users, {
    fields: [bankStatements.createdBy],
    references: [users.id],
  }),
}));

export const bankStatementLinesRelations = relations(bankStatementLines, ({ one, many }) => ({
  statement: one(bankStatements, {
    fields: [bankStatementLines.statementId],
    references: [bankStatements.id],
  }),
  reconciliationItems: many(bankReconciliationItems),
}));

export const bankReconciliationItemsRelations = relations(bankReconciliationItems, ({ one }) => ({
  bankAccount: one(accounts, {
    fields: [bankReconciliationItems.bankAccountId],
    references: [accounts.id],
  }),
  statementLine: one(bankStatementLines, {
    fields: [bankReconciliationItems.statementLineId],
    references: [bankStatementLines.id],
  }),
  ledgerEntry: one(ledgerEntries, {
    fields: [bankReconciliationItems.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
  matchedByUser: one(users, {
    fields: [bankReconciliationItems.matchedBy],
    references: [users.id],
  }),
}));

export const invoiceAllocationsRelations = relations(invoiceAllocations, ({ one }) => ({
  sale: one(sales, {
    fields: [invoiceAllocations.saleId],
    references: [sales.id],
  }),
  purchase: one(purchases, {
    fields: [invoiceAllocations.purchaseId],
    references: [purchases.id],
  }),
  receiptVoucher: one(receiptVouchers, {
    fields: [invoiceAllocations.receiptVoucherId],
    references: [receiptVouchers.id],
  }),
  paymentVoucher: one(contraVouchers, {
    fields: [invoiceAllocations.paymentVoucherId],
    references: [contraVouchers.id],
  }),
  createdByUser: one(users, {
    fields: [invoiceAllocations.createdBy],
    references: [users.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one, many }) => ({
  lines: many(budgetLines),
  fiscalYear: one(fiscalYears, {
    fields: [budgets.fiscalYearId],
    references: [fiscalYears.id],
  }),
  createdByUser: one(users, {
    fields: [budgets.createdBy],
    references: [users.id],
  }),
}));

export const budgetLinesRelations = relations(budgetLines, ({ one }) => ({
  budget: one(budgets, {
    fields: [budgetLines.budgetId],
    references: [budgets.id],
  }),
  account: one(accounts, {
    fields: [budgetLines.accountId],
    references: [accounts.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  performedByUser: one(users, {
    fields: [auditLogs.performedBy],
    references: [users.id],
  }),
}));

export const generalJournalRelations = relations(generalJournal, ({ one, many }) => ({
  lines: many(journalLines),
  createdByUser: one(users, {
    fields: [generalJournal.createdBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [generalJournal.approvedBy],
    references: [users.id],
  }),
  journalVoucher: one(journalVouchers, {
    fields: [generalJournal.journalVoucherId],
    references: [journalVouchers.id],
  }),
}));

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  journal: one(generalJournal, {
    fields: [journalLines.journalId],
    references: [generalJournal.id],
  }),
  account: one(accounts, {
    fields: [journalLines.accountId],
    references: [accounts.id],
  }),
}));

export const salesDaybookRelations = relations(salesDaybook, ({ one }) => ({
  customer: one(accounts, {
    fields: [salesDaybook.customerId],
    references: [accounts.id],
  }),
  sale: one(sales, {
    fields: [salesDaybook.saleId],
    references: [sales.id],
  }),
}));

export const purchasesDaybookRelations = relations(purchasesDaybook, ({ one }) => ({
  supplier: one(accounts, {
    fields: [purchasesDaybook.supplierId],
    references: [accounts.id],
  }),
  purchase: one(purchases, {
    fields: [purchasesDaybook.purchaseId],
    references: [purchases.id],
  }),
}));

export const cashBookRelations = relations(cashBook, ({ one }) => ({
  bankAccount: one(accounts, {
    fields: [cashBook.bankAccountId],
    references: [accounts.id],
  }),
  receiptVoucher: one(receiptVouchers, {
    fields: [cashBook.receiptVoucherId],
    references: [receiptVouchers.id],
  }),
  contraVoucher: one(contraVouchers, {
    fields: [cashBook.contraVoucherId],
    references: [contraVouchers.id],
  }),
}));

export const salesReturnsDaybookRelations = relations(salesReturnsDaybook, ({ one }) => ({
  customer: one(accounts, {
    fields: [salesReturnsDaybook.customerId],
    references: [accounts.id],
  }),
  sale: one(sales, {
    fields: [salesReturnsDaybook.saleId],
    references: [sales.id],
  }),
}));

export const purchaseReturnsDaybookRelations = relations(purchaseReturnsDaybook, ({ one }) => ({
  supplier: one(accounts, {
    fields: [purchaseReturnsDaybook.supplierId],
    references: [accounts.id],
  }),
  purchase: one(purchases, {
    fields: [purchaseReturnsDaybook.purchaseId],
    references: [purchases.id],
  }),
}));

export const daybookAuditLogsRelations = relations(daybookAuditLogs, ({ one }) => ({
  changedByUser: one(users, {
    fields: [daybookAuditLogs.changedBy],
    references: [users.id],
  }),
}));
