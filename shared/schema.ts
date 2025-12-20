import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const now = sql`CURRENT_TIMESTAMP`;

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
    ],
  }).notNull(),
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

export const fiscalPeriods = sqliteTable("fiscal_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fiscalYearId: integer("fiscal_year_id").notNull().references(() => fiscalYears.id, { onDelete: "cascade" }),
  yearMonth: text("year_month").notNull(), // YYYY-MM
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
  periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
  isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
  closedBy: integer("closed_by").references(() => users.id),
  closedAt: integer("closed_at", { mode: "timestamp" }),
});

export const fiscalOpeningBalances = sqliteTable("fiscal_opening_balances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fiscalYearId: integer("fiscal_year_id").notNull().references(() => fiscalYears.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  openingBalance: text("opening_balance").notNull().default("0"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

// Tax Configuration & Compliance
export const taxTypes = sqliteTable("tax_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(), // e.g. GST, WHT
  direction: text("direction", { enum: ["sales", "purchases", "both"] }).notNull().default("both"),
  inputAccountId: integer("input_account_id").references(() => accounts.id), // tax receivable
  outputAccountId: integer("output_account_id").references(() => accounts.id), // tax payable
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const taxRates = sqliteTable("tax_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taxTypeId: integer("tax_type_id").notNull().references(() => taxTypes.id, { onDelete: "cascade" }),
  ratePercent: text("rate_percent").notNull().default("0"),
  effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull().default(now),
  effectiveTo: integer("effective_to", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const taxLedgers = sqliteTable("tax_ledgers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taxTypeId: integer("tax_type_id").notNull().references(() => taxTypes.id),
  sourceType: text("source_type").notNull(), // purchase|sale
  sourceId: integer("source_id").notNull(),
  taxBase: text("tax_base").notNull().default("0"),
  taxAmount: text("tax_amount").notNull().default("0"),
  postingDate: integer("posting_date", { mode: "timestamp" }).notNull().default(now),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertTaxTypeSchema = createInsertSchema(taxTypes).omit({ id: true, createdAt: true });
export type InsertTaxType = z.infer<typeof insertTaxTypeSchema>;
export type TaxType = typeof taxTypes.$inferSelect;

export const insertTaxRateSchema = createInsertSchema(taxRates).omit({ id: true });
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxRate = typeof taxRates.$inferSelect;

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
  employmentType: text("employment_type", { enum: ["Permanent", "Contract"] }).notNull().default("Permanent"),
  basicSalary: text("basic_salary").notNull().default("0"),
  status: text("status", { enum: ["Active", "Inactive"] }).notNull().default("Active"),
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

export const insertEmployeeSalaryStructureSchema = createInsertSchema(employeeSalaryStructures).omit({
  id: true,
  grossSalary: true,
  netSalary: true,
  createdAt: true,
});
export type InsertEmployeeSalaryStructure = z.infer<typeof insertEmployeeSalaryStructureSchema>;
export type EmployeeSalaryStructure = typeof employeeSalaryStructures.$inferSelect;

// Payroll Processing
export const payrolls = sqliteTable("payrolls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollMonth: text("payroll_month").notNull(), // YYYY-MM
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  basicSalary: text("basic_salary").notNull().default("0"),
  allowances: text("allowances").notNull().default("0"),
  deductions: text("deductions").notNull().default("0"),
  netSalary: text("net_salary").notNull().default("0"),
  paymentStatus: text("payment_status", { enum: ["Paid", "Unpaid"] }).notNull().default("Unpaid"),
  paymentMethod: text("payment_method", { enum: ["Cash", "Bank"] }),
  paymentAccountId: integer("payment_account_id").references(() => accounts.id),
  status: text("status", { enum: ["generated", "approved", "paid"] }).notNull().default("generated"),
  journalVoucherId: integer("journal_voucher_id").references(() => journalVouchers.id),
  paymentJournalVoucherId: integer("payment_journal_voucher_id").references(() => journalVouchers.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedByRole: text("approved_by_role"),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  paidAt: integer("paid_at", { mode: "timestamp" }),
});

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
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

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
  chargesAdd: text("charges_add").notNull().default("0"),
  chargesLess: text("charges_less").notNull().default("0"),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxAmount: text("tax_amount").notNull().default("0"),
  buyerAmount: text("buyer_amount").notNull().default("0"),
  balanceDue: text("balance_due").notNull().default("0"),
  paidAmount: text("paid_amount").notNull().default("0"),
  amountInWords: text("amount_in_words").notNull().default(""),
  notes: text("notes"),
  purchaseDate: integer("purchase_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
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
  startDate: integer("start_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
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

// Sales table
export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => accounts.id),
  vehicleNumber: text("vehicle_number"),
  loadingCharges: text("loading_charges").default("0"),
  weighingCharges: text("weighing_charges").default("0"),
  otherCharges: text("other_charges").default("0"),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxAmount: text("tax_amount").notNull().default("0"),
  subtotal: text("subtotal").notNull().default("0"),
  totalAmount: text("total_amount").notNull().default("0"),
  paidAmount: text("paid_amount").notNull().default("0"),
  notes: text("notes"),
  gatePassNumber: text("gate_pass_number"),
  saleDate: integer("sale_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
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
  pricePerUnit: text("price_per_unit").notNull(),
  totalPrice: text("total_price").notNull(),
});

export const insertSaleItemSchema = createInsertSchema(saleItems).omit({
  id: true,
});
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type SaleItem = typeof saleItems.$inferSelect;

// Ledger Entries table
export const ledgerEntries = sqliteTable("ledger_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  transactionType: text("transaction_type", { enum: ["debit", "credit"] }).notNull(),
  amount: text("amount").notNull(),
  balance: text("balance").notNull(),
  description: text("description").notNull(),
  descriptionUrdu: text("description_urdu"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  entryDate: integer("entry_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

// Cash Receipt Vouchers
export const receiptVouchers = sqliteTable("receipt_vouchers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNumber: text("voucher_number").notNull().unique(),
  voucherType: text("voucher_type").notNull().default("CR"),
  voucherDate: integer("voucher_date", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  settlementAccountId: integer("settlement_account_id").references(() => accounts.id), // cash/bank account used as counter-entry
  totalDebit: text("total_debit").notNull().default("0"),
  totalCredit: text("total_credit").notNull().default("0"),
  amountInWords: text("amount_in_words").notNull().default(""),
  narration: text("narration"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const receiptVoucherLines = sqliteTable("receipt_voucher_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherId: integer("voucher_id").notNull().references(() => receiptVouchers.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  narration: text("narration"),
  debit: text("debit").notNull().default("0"),
  credit: text("credit").notNull().default("0"),
  referenceType: text("reference_type"), // sale|purchase|journal_voucher|...
  referenceId: integer("reference_id"),
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

// Journal Vouchers
export const journalVouchers = sqliteTable("journal_vouchers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  voucherNo: text("voucher_no").notNull().unique(),
  voucherDate: integer("voucher_date", { mode: "timestamp" }).notNull().default(now),
  totalAmount: text("total_amount").notNull().default("0"),
  amountInWords: text("amount_in_words").notNull().default(""),
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
  amountInWords: true,
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

// Cash Transactions
export const cashTransactions = sqliteTable("cash_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  transactionDate: integer("transaction_date", { mode: "timestamp" }).notNull().default(now),
  transactionType: text("transaction_type", { enum: ["DEBIT", "CREDIT"] }).notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
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
  fiscalPeriodId: integer("fiscal_period_id").references(() => fiscalPeriods.id),
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

export const bankReconciliationItems = sqliteTable("bank_reconciliation_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bankAccountId: integer("bank_account_id").notNull().references(() => accounts.id),
  statementLineId: integer("statement_line_id").references(() => bankStatementLines.id, { onDelete: "cascade" }),
  ledgerEntryId: integer("ledger_entry_id").references(() => ledgerEntries.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["matched", "unmatched"] }).notNull().default("unmatched"),
  matchedAt: integer("matched_at", { mode: "timestamp" }),
  matchedBy: integer("matched_by").references(() => users.id),
});

// AR/AP Allocations (invoice settlement)
export const invoiceAllocations = sqliteTable("invoice_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceType: text("invoice_type", { enum: ["sale", "purchase"] }).notNull(),
  invoiceId: integer("invoice_id").notNull(),
  voucherType: text("voucher_type", { enum: ["receipt", "payment"] }).notNull(),
  voucherId: integer("voucher_id").notNull(),
  allocationDate: integer("allocation_date", { mode: "timestamp" }).notNull().default(now),
  amount: text("amount").notNull().default("0"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

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

export const budgetLines = sqliteTable("budget_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  budgetId: integer("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  yearMonth: text("year_month").notNull(), // YYYY-MM
  amount: text("amount").notNull().default("0"),
});

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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  purchases: many(purchases),
  sales: many(sales),
  processing: many(processing),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  purchases: many(purchases),
  sales: many(sales),
  ledgerEntries: many(ledgerEntries),
  expenseEntriesAsExpense: many(expenseEntries),
  expenseEntriesAsPayFrom: many(expenseEntries),
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
  journalVoucher: one(journalVouchers, { fields: [payrolls.journalVoucherId], references: [journalVouchers.id] }),
  paymentJournalVoucher: one(journalVouchers, { fields: [payrolls.paymentJournalVoucherId], references: [journalVouchers.id] }),
  paymentAccount: one(accounts, { fields: [payrolls.paymentAccountId], references: [accounts.id] }),
  auditLogs: many(payrollAuditLogs),
}));

export const payrollAuditLogsRelations = relations(payrollAuditLogs, ({ one }) => ({
  payroll: one(payrolls, { fields: [payrollAuditLogs.payrollId], references: [payrolls.id] }),
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
}));
