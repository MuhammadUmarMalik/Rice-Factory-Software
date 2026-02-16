import { db } from "./db";
import { eq, and, desc, sql, gte, lte, lt, isNull, inArray, or } from "drizzle-orm";
import {
  computeAgingBuckets,
  computeBalanceSheetValidation,
  computeInventoryRollForward,
  computeTrialBalanceTotals,
} from "../services/reports/calculations";
import {
  users, accounts, products, purchases, purchaseItems, purchaseCharges,
  processing, sales, saleItems, ledgerEntries,
  type User, type InsertUser, type Account, type InsertAccount,
  notifications, type Notification, type InsertNotification,
  employees, employeeSalaryStructures, payrolls, payrollAuditLogs,
  type Employee, type InsertEmployee,
  type EmployeeSalaryStructure, type InsertEmployeeSalaryStructure,
  type Payroll, type InsertPayroll,
  type PayrollAuditLog, type InsertPayrollAuditLog,
  type Product, type InsertProduct, type Purchase, type InsertPurchase,
  type PurchaseItem, type InsertPurchaseItem, type PurchaseCharge, type InsertPurchaseCharge,
  type Processing, type InsertProcessing,
  type Sale, type InsertSale, type SaleItem, type InsertSaleItem,
  type LedgerEntry, type InsertLedgerEntry,
  receiptVouchers, receiptVoucherLines,
  type ReceiptVoucher, type InsertReceiptVoucher,
  type ReceiptVoucherLine, type InsertReceiptVoucherLine,
  journalVouchers, journalVoucherEntries,
  type JournalVoucher, type InsertJournalVoucher,
  type JournalVoucherEntry, type InsertJournalVoucherEntry,
  cashTransactions,
  type CashTransaction, type InsertCashTransaction,
  periodLocks,
  type PeriodLock, type InsertPeriodLock,
  fiscalYears, fiscalPeriods, fiscalOpeningBalances,
  taxTypes, taxRates, taxLedgers,
  invoiceAllocations,
  auditLogs,
  contraVouchers, contraVoucherLines,
  assetCategories, fixedAssets, assetDepreciationRuns,
  bankStatements, bankStatementLines, bankReconciliationItems,
  budgets, budgetLines,
  expenseEntries,
  type ExpenseEntry, type InsertExpenseEntry, insertExpenseEntrySchema,
} from "@shared/schema";

type DbClient = typeof db;
type PurchaseItemInput = Omit<
  InsertPurchaseItem,
  "id" | "purchaseId" | "grossWeightKg" | "netWeightKg" | "moundQty" | "moundRemainderKg" | "amount"
> &
  Partial<Pick<InsertPurchaseItem, "grossWeightKg" | "netWeightKg" | "moundQty" | "moundRemainderKg" | "amount">>;
type PurchaseChargeInput = Omit<InsertPurchaseCharge, "id" | "purchaseId">;
type SaleItemInput = Omit<InsertSaleItem, "id" | "saleId" | "totalPrice">;
type ReceiptLineInput = Omit<InsertReceiptVoucherLine, "id" | "voucherId">;
type JournalEntryInput = Omit<InsertJournalVoucherEntry, "id" | "journalVoucherId">;
type CashTxInput = Omit<InsertCashTransaction, "id" | "createdAt">;
type LedgerReportRow = {
  id: number;
  entryDate: Date | number;
  narration: string;
  vchType: string;
  vchNo: string;
  debit: string;
  credit: string;
  runningBalance: string;
  referenceType?: string | null;
  referenceId?: number | null;
};
type LedgerReport = {
  account: Account;
  openingBalance: string;
  rows: LedgerReportRow[];
  totals: { debit: string; credit: string; closingBalance: string };
  validation: { closingMatchesLastRow: boolean; closingMatchesTotals: boolean };
};

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  // Notifications
  listNotifications(userId: number, limit?: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number, userId: number): Promise<boolean>;
  markAllNotificationsRead(userId: number): Promise<number>;

  // Fiscal Year / Periods
  getFiscalYears(): Promise<any[]>;
  getFiscalPeriods(fiscalYearId: number): Promise<any[]>;
  createFiscalYear(
    data: { name: string; startDate: Date; endDate: Date; status?: "draft" | "open" | "closed" },
    performedBy?: { userId?: number; role?: string },
  ): Promise<any>;
  setFiscalYearStatus(
    fiscalYearId: number,
    status: "draft" | "open" | "closed",
    performedBy?: { userId?: number; role?: string },
  ): Promise<any>;
  setFiscalPeriodClosed(
    periodId: number,
    isClosed: boolean,
    performedBy?: { userId?: number; role?: string },
  ): Promise<any>;
  rollForwardOpeningBalances(
    fromFiscalYearId: number,
    to: { name: string; startDate: Date; endDate: Date },
    performedBy?: { userId?: number; role?: string },
  ): Promise<any>;

  // Expense entries
  getExpenses(): Promise<ExpenseEntry[]>;
  createExpense(expense: InsertExpenseEntry, performedBy?: { userId?: number; role?: string }): Promise<ExpenseEntry>;
  getExpense(id: number): Promise<ExpenseEntry | undefined>;
  updateExpense(id: number, expense: Partial<InsertExpenseEntry>, performedBy?: { userId?: number; role?: string }): Promise<ExpenseEntry | undefined>;
  deleteExpense(id: number): Promise<boolean>;

  // Accounts
  getAccounts(type?: string, active?: boolean): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;
  deleteAccount(id: number): Promise<boolean>;

  // Products
  getProducts(): Promise<Product[]>;
  getActiveProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Purchases
  getPurchases(): Promise<Purchase[]>;
  getPurchase(id: number): Promise<Purchase | undefined>;
  getPurchaseWithDetails(id: number): Promise<(Purchase & { items: PurchaseItem[]; charges: PurchaseCharge[] }) | undefined>;
  createPurchase(purchase: InsertPurchase, items: PurchaseItemInput[], charges: PurchaseChargeInput[]): Promise<Purchase>;
  updatePurchase(id: number, purchase: Partial<InsertPurchase>, items: PurchaseItemInput[], charges: PurchaseChargeInput[]): Promise<Purchase | undefined>;
  deletePurchase(id: number): Promise<boolean>;
  getNextPurchaseInvoiceNumber(): Promise<string>;
  getNextPurchaseBillNumber(): Promise<string>;

  // Purchase Items
  getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]>;
  getPurchaseCharges(purchaseId: number): Promise<PurchaseCharge[]>;

  // Processing
  getProcessingBatches(): Promise<Processing[]>;
  getProcessingBatch(id: number): Promise<Processing | undefined>;
  createProcessing(batch: InsertProcessing): Promise<Processing>;
  updateProcessing(id: number, batch: Partial<InsertProcessing>): Promise<Processing | undefined>;
  getNextBatchNumber(): Promise<string>;

  // Sales
  getSales(): Promise<Sale[]>;
  getSale(id: number): Promise<Sale | undefined>;
  createSale(sale: InsertSale, items: SaleItemInput[]): Promise<Sale>;
  updateSale(id: number, sale: Partial<InsertSale>, items: SaleItemInput[]): Promise<Sale | undefined>;
  deleteSale(id: number): Promise<boolean>;
  getNextSaleInvoiceNumber(): Promise<string>;
  getNextGatePassNumber(): Promise<string>;

  // Sale Items
  getSaleItems(saleId: number): Promise<SaleItem[]>;

  // Ledger
  getLedgerEntries(accountId?: number, referenceType?: string, startDate?: Date, endDate?: Date): Promise<LedgerEntry[]>;
  getLedgerReport(params: {
    accountId: number;
    referenceType?: string;
    startDate?: Date;
    endDate?: Date;
    narration?: string;
  }): Promise<LedgerReport>;
  createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry>;
  getOrCreateCashAccount(): Promise<Account>;
  recordCashTransaction(tx: CashTxInput): Promise<CashTransaction>;
  getCashSummary(): Promise<{ opening: number; debit: number; credit: number; closing: number }>;
  getCashTransactions(): Promise<CashTransaction[]>;

  // Reports
  getStockReport(filters?: {
    fromDate?: Date;
    toDate?: Date;
    productId?: number;
    category?: string;
    unit?: string;
  }): Promise<{
    rows: Array<{
      productId: number;
      itemCode: string;
      itemName: string;
      category: string;
      unit: string;
      openingQty: string;
      openingValue: string;
      inQty: string;
      inValue: string;
      outQty: string;
      outValue: string;
      closingQty: string;
      closingValue: string;
      avgCost: string;
      currentStock: string;
    }>;
    totals: { openingQty: string; inQty: string; outQty: string; closingQty: string; closingValue: string };
    validation: { rollForwardOk: boolean; rollForwardDifference: string };
  }>;
  getTrialBalance(asOfDate?: Date): Promise<{
    rows: { account: Account; debit: string; credit: string }[];
    totals: { debit: string; credit: string };
    validation: { balanced: boolean; difference: string };
  }>;
  getProfitLoss(startDate?: Date, endDate?: Date): Promise<{
    period: { fromDate: Date; toDate: Date };
    revenue: string;
    costOfSales: string;
    grossProfit: string;
    operatingExpenses: string;
    netProfit: string;
  }>;
  getPurchaseReport(filters?: {
    fromDate?: Date;
    toDate?: Date;
    supplierId?: number;
    productId?: number;
    paymentStatus?: "paid" | "partial" | "unpaid";
  }): Promise<{
    rows: Array<{
      id: number;
      invoiceNumber: string;
      purchaseDate: Date;
      supplierId: number;
      supplierName: string;
      subtotal: string;
      discount: string;
      tax: string;
      otherCharges: string;
      total: string;
      paid: string;
      balance: string;
    }>;
    totals: { subtotal: string; discount: string; tax: string; otherCharges: string; total: string; paid: string; balance: string };
  }>;
  getSalesReport(filters?: {
    fromDate?: Date;
    toDate?: Date;
    customerId?: number;
    productId?: number;
    paymentStatus?: "paid" | "partial" | "unpaid";
  }): Promise<{
    rows: Array<{
      id: number;
      invoiceNumber: string;
      saleDate: Date;
      customerId: number;
      customerName: string;
      subtotal: string;
      discount: string;
      tax: string;
      otherCharges: string;
      total: string;
      received: string;
      balance: string;
    }>;
    totals: { subtotal: string; discount: string; tax: string; otherCharges: string; total: string; received: string; balance: string };
  }>;

  // New Accounting Reports (derived, no duplicate data)
  getPeriodPurchases(
    startDate: Date,
    endDate: Date,
    supplierId?: number,
    groupBy?: "day" | "week" | "month",
  ): Promise<{
    rows: Array<{
      period: string;
      periodStart: Date;
      periodEnd: Date;
      totalAmount: string;
      paidAmount: string;
      balanceAmount: string;
      invoiceCount: number;
    }>;
    totals: { totalAmount: string; paidAmount: string; balanceAmount: string; invoiceCount: number };
  }>;
  getPeriodSales(
    startDate: Date,
    endDate: Date,
    customerId?: number,
    groupBy?: "day" | "week" | "month",
  ): Promise<{
    rows: Array<{
      period: string;
      periodStart: Date;
      periodEnd: Date;
      totalAmount: string;
      receivedAmount: string;
      balanceAmount: string;
      invoiceCount: number;
    }>;
    totals: { totalAmount: string; receivedAmount: string; balanceAmount: string; invoiceCount: number };
  }>;
  getGrossProfit(startDate: Date, endDate: Date): Promise<{
    netSales: string;
    costOfGoodsSold: string;
    grossProfit: string;
    grossMarginPercent: string;
    rows?: Array<{ saleId: number; invoiceNumber: string; saleDate: Date; netSales: string; costOfGoodsSold: string; grossProfit: string }>;
  }>;
  getDayBook(date: Date): Promise<{
    openingBalance: { amount: string; type: "DR" | "CR" | "" };
    rows: Array<{
      srNo: number;
      id: string;
      type: string;
      partyName: string;
      mode: string;
      receipt: string;
      payment: string;
      balanceAmount: string;
      balanceType: "DR" | "CR" | "";
      date: Date;
      referenceType?: string | null;
      referenceId?: number | null;
    }>;
    totals: { receipt: string; payment: string };
  }>;
  getOutstandingCustomers(asOfDate: Date, customerId?: number): Promise<{
    rows: Array<{
      saleId: number;
      invoiceNumber: string;
      customerId: number;
      customerName: string;
      invoiceAmount: string;
      receivedAmount: string;
      outstandingAmount: string;
      dueDate: Date | null;
      saleDate: Date;
      daysOutstanding: number;
      bucket0To30: string;
      bucket31To60: string;
      bucket61To90: string;
      bucket91Plus: string;
    }>;
    totals: {
      invoiceAmount: string;
      receivedAmount: string;
      outstandingAmount: string;
      bucket0To30: string;
      bucket31To60: string;
      bucket61To90: string;
      bucket91Plus: string;
    };
  }>;
  getOutstandingSuppliers(asOfDate: Date, supplierId?: number): Promise<{
    rows: Array<{
      purchaseId: number;
      invoiceNumber: string;
      supplierId: number;
      supplierName: string;
      billAmount: string;
      paidAmount: string;
      outstandingAmount: string;
      dueDate: Date | null;
      purchaseDate: Date;
      daysOutstanding: number;
      bucket0To30: string;
      bucket31To60: string;
      bucket61To90: string;
      bucket91Plus: string;
    }>;
    totals: {
      billAmount: string;
      paidAmount: string;
      outstandingAmount: string;
      bucket0To30: string;
      bucket31To60: string;
      bucket61To90: string;
      bucket91Plus: string;
    };
  }>;
  getIncomeStatement(startDate: Date, endDate: Date): Promise<{
    period: { fromDate: Date; toDate: Date };
    revenue: string;
    costOfSales: string;
    grossProfit: string;
    operatingExpenses: string;
    netProfit: string;
  }>;
  getBalanceSheet(asOfDate: Date): Promise<{
    asOfDate: Date;
    assets: { cash: string; bank: string; receivables: string; inventory: string; total: string };
    liabilities: { payables: string; expensesPayable: string; total: string };
    equity: { capital: string; retainedEarnings: string; total: string };
    totals: { assets: string; liabilitiesAndEquity: string };
    validation: { balanced: boolean; difference: string };
  }>;
  getCapitalStatement(startDate: Date, endDate: Date): Promise<{
    openingCapital: string;
    additionalCapital: string;
    drawings: string;
    netProfit: string;
    closingCapital: string;
  }>;
  getSalaryAccount(startDate: Date, endDate: Date): Promise<{
    rows: Array<{
      accountId: number | null;
      employee: string;
      salaryMonth: string;
      basicSalary: string;
      allowances: string;
      deductions: string;
      netSalary: string;
      paidAmount: string;
      balanceAmount: string;
    }>;
    totals: { basicSalary: string; allowances: string; deductions: string; netSalary: string; paidAmount: string; balanceAmount: string };
  }>;
  getReportDetail(referenceType: string, referenceId: number): Promise<any>;

  // Cash Receipts
  getReceiptVouchers(): Promise<ReceiptVoucher[]>;
  getReceiptVoucher(id: number): Promise<(ReceiptVoucher & { lines: ReceiptVoucherLine[] }) | undefined>;
  createReceiptVoucher(data: InsertReceiptVoucher, lines: ReceiptLineInput[]): Promise<ReceiptVoucher>;
  updateReceiptVoucher(id: number, data: Partial<InsertReceiptVoucher>, lines: ReceiptLineInput[]): Promise<ReceiptVoucher | undefined>;
  deleteReceiptVoucher(id: number): Promise<boolean>;
  getNextReceiptVoucherNumber(voucherType?: string): Promise<string>;

  // Journal Vouchers
  getJournalVouchers(): Promise<(JournalVoucher & { entries: JournalVoucherEntry[] })[]>;
  getJournalVoucher(id: number): Promise<(JournalVoucher & { entries: JournalVoucherEntry[] }) | undefined>;
  createJournalVoucher(data: InsertJournalVoucher, entries: JournalEntryInput[]): Promise<JournalVoucher>;
  updateJournalVoucher(id: number, data: Partial<InsertJournalVoucher>, entries: JournalEntryInput[]): Promise<JournalVoucher | undefined>;
  approveJournalVoucher(id: number, approverId?: number): Promise<JournalVoucher | undefined>;
  getNextJournalVoucherNumber(): Promise<string>;
  deleteJournalVoucher(id: number): Promise<boolean>;

  // HR / Employees
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined>;

  // Salary Structures
  getEmployeeSalaryStructures(employeeId: number): Promise<EmployeeSalaryStructure[]>;
  createEmployeeSalaryStructure(data: InsertEmployeeSalaryStructure): Promise<EmployeeSalaryStructure>;
  updateEmployeeSalaryStructure(
    employeeId: number,
    structureId: number,
    data: Partial<InsertEmployeeSalaryStructure>,
  ): Promise<EmployeeSalaryStructure | undefined>;
  deleteEmployeeSalaryStructure(employeeId: number, structureId: number): Promise<boolean>;
  getEffectiveSalaryStructure(employeeId: number, asOf: Date): Promise<EmployeeSalaryStructure | undefined>;

  // Payroll
  getPayrolls(filters?: { month?: string; status?: string; employeeId?: number }): Promise<Payroll[]>;
  generateMonthlyPayroll(month: string, performedBy?: { userId?: number; role?: string }): Promise<{ created: number; skipped: number }>;
  approvePayroll(payrollId: number, performedBy?: { userId?: number; role?: string }, postingDate?: Date): Promise<Payroll | undefined>;
  paySalary(
    payrollId: number,
    payment: { method: "Cash" | "Bank"; paymentAccountId?: number; paymentDate?: Date },
    performedBy?: { userId?: number; role?: string },
  ): Promise<Payroll | undefined>;
  getPayrollAudit(payrollId: number): Promise<PayrollAuditLog[]>;

  // Period locks
  getPeriodLocks(): Promise<PeriodLock[]>;
  createPeriodLock(lock: InsertPeriodLock): Promise<PeriodLock>;
  deletePeriodLock(id: number): Promise<boolean>;
}

  function parseAmount(value: string | number | null | undefined): number {
    const num = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(num)) {
      throw new Error("Invalid numeric value");
    }
    return num;
  }

  function toValidDate(value?: string | number | Date | null): Date {
    const dt = value instanceof Date ? value : new Date(value ?? Date.now());
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
  }

  function normalizeReceiptVoucherType(value?: string | null): "CR" | "DR" {
    const v = (value || "CR").toString().trim().toUpperCase();
    if (v === "CR" || v === "DR") return v;
    if (v === "RECEIPT" || v === "CRV" || v === "BRV") return "CR";
    if (v === "PAYMENT" || v === "CPV" || v === "BPV") return "DR";
    return "CR";
  }

  function resolveReceiptLineAmount(line: ReceiptLineInput & { amount?: string | number | null }): number {
    const debitValue = parseAmount(line.debit || "0");
    const creditValue = parseAmount(line.credit || "0");
    const amountValue = line.amount != null ? parseAmount(line.amount) : 0;
    return Math.max(debitValue, creditValue, amountValue);
  }

function endOfDay(d: Date): Date {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

function parsePayrollMonth(value: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) throw new Error("payrollMonth must be YYYY-MM");
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) throw new Error("payrollMonth must be YYYY-MM");
  return { year, month };
}

function startOfPayrollMonth(month: string): Date {
  const { year, month: mm } = parsePayrollMonth(month);
  return new Date(year, mm - 1, 1);
}

function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  const dt = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

function startOfWeek(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day + 6) % 7; // Monday start
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfWeek(d: Date): Date {
  const dt = startOfWeek(d);
  dt.setDate(dt.getDate() + 6);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

function weekNumber(d: Date): number {
  const yearStart = startOfWeek(new Date(d.getFullYear(), 0, 1));
  const target = startOfWeek(d);
  const diffMs = target.getTime() - yearStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

type NormalSide = "DEBIT" | "CREDIT";
function normalSideForAccountType(type: string | null | undefined): NormalSide {
  if (!type) return "DEBIT";
  const t = String(type).toLowerCase();
  if (["supplier", "liability", "equity", "income"].includes(t)) return "CREDIT";
  return "DEBIT";
}

function ledgerSumByNormal(normal: NormalSide) {
  return sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = ${normal === "DEBIT" ? sql`'debit'` : sql`'credit'`} THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`;
}

function toWords(n: number): string {
  // Simple integer-to-words helper for positive amounts (English, up to billions)
  const belowTwenty = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const scales = ["","thousand","million","billion"];

  if (n === 0) return "zero";
  const chunk = (num: number): string => {
    let word = "";
    if (num >= 100) {
      word += `${belowTwenty[Math.floor(num / 100)]} hundred`;
      num %= 100;
      if (num) word += " ";
    }
    if (num >= 20) {
      word += tens[Math.floor(num / 10)];
      num %= 10;
      if (num) word += `-${belowTwenty[num]}`;
    } else if (num > 0) {
      word += belowTwenty[num];
    }
    return word;
  };

  const parts: string[] = [];
  let remaining = Math.floor(n);
  let scaleIndex = 0;
  while (remaining > 0) {
    const c = remaining % 1000;
    if (c) {
      const prefix = chunk(c);
      const suffix = scales[scaleIndex];
      parts.unshift(suffix ? `${prefix} ${suffix}` : prefix);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }
  return parts.join(" ");
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = db.select().from(users).where(eq(users.id, id)).all();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = db.select().from(users).where(eq(users.username, username)).all();
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.fullName).all();
  }

  // Notifications
  async listNotifications(userId: number, limit = 50): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.id))
      .limit(limit)
      .all();
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: number, userId: number): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .run();
    return result.changes > 0;
  }

  async markAllNotificationsRead(userId: number): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId))
      .run();
    return result.changes || 0;
  }

  // Fiscal Years / Periods
  async getFiscalYears() {
    return db.select().from(fiscalYears).orderBy(fiscalYears.startDate).all();
  }

  async getFiscalPeriods(fiscalYearId: number) {
    return db.select().from(fiscalPeriods).where(eq(fiscalPeriods.fiscalYearId, fiscalYearId)).orderBy(fiscalPeriods.periodStart).all();
  }

  private generatePeriodsForYear(client: DbClient, fiscalYearId: number, start: Date, end: Date) {
    const cursor = new Date(start);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const periodStart = startOfMonth(cursor);
      const periodEnd = endOfMonth(cursor);
      client.insert(fiscalPeriods).values({
        fiscalYearId,
        yearMonth: toYearMonth(cursor),
        periodStart,
        periodEnd,
        isClosed: false as any,
      } as any).run();
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  async createFiscalYear(
    data: { name: string; startDate: Date; endDate: Date; status?: "draft" | "open" | "closed" },
    performedBy?: { userId?: number; role?: string },
  ) {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const overlap = client
        .select()
        .from(fiscalYears)
        .where(
          or(
            and(lte(fiscalYears.startDate, data.startDate), gte(fiscalYears.endDate, data.startDate)),
            and(lte(fiscalYears.startDate, data.endDate), gte(fiscalYears.endDate, data.endDate)),
          ),
        )
        .all();
      if (overlap.length > 0) {
        throw new Error("Fiscal year overlaps an existing year");
      }

      const fy = client.insert(fiscalYears).values({
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status || "draft",
        createdBy: performedBy?.userId,
        createdAt: new Date(),
      } as any).returning().get();

      this.generatePeriodsForYear(client, fy.id, data.startDate, data.endDate);

      const accs = client.select().from(accounts).all();
      for (const acc of accs) {
        client.insert(fiscalOpeningBalances).values({
          fiscalYearId: fy.id,
          accountId: acc.id,
          openingBalance: acc.openingBalance || "0",
          createdBy: performedBy?.userId,
          createdAt: new Date(),
        } as any).run();
      }

      return fy as any;
    });
  }

  async setFiscalYearStatus(
    fiscalYearId: number,
    status: "draft" | "open" | "closed",
    performedBy?: { userId?: number; role?: string },
  ) {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const [existing] = client.select().from(fiscalYears).where(eq(fiscalYears.id, fiscalYearId)).all();
      if (!existing) return undefined;

      if (status === "closed") {
        client
          .update(fiscalPeriods)
          .set({ isClosed: true as any, closedBy: performedBy?.userId, closedAt: new Date() })
          .where(eq(fiscalPeriods.fiscalYearId, fiscalYearId))
          .run();
      }

      const [updated] = client
        .update(fiscalYears)
        .set({ status })
        .where(eq(fiscalYears.id, fiscalYearId))
        .returning()
        .all();
      return updated as any;
    });
  }

  async setFiscalPeriodClosed(
    periodId: number,
    isClosed: boolean,
    performedBy?: { userId?: number; role?: string },
  ) {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const [existing] = client.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, periodId)).all();
      if (!existing) return undefined;

      const [updated] = client
        .update(fiscalPeriods)
        .set({
          isClosed: isClosed as any,
          closedBy: isClosed ? performedBy?.userId : null,
          closedAt: isClosed ? new Date() : null,
        })
        .where(eq(fiscalPeriods.id, periodId))
        .returning()
        .all();
      return updated as any;
    });
  }

  private computeBalanceAsOf(client: DbClient, accountId: number, asOf: Date): number {
    const [acc] = client.select().from(accounts).where(eq(accounts.id, accountId)).all();
    if (!acc) return 0;

    const [fy] = client
      .select()
      .from(fiscalYears)
      .where(and(lte(fiscalYears.startDate, asOf), gte(fiscalYears.endDate, asOf)))
      .all();

    let opening = parseAmount(acc.openingBalance || "0");
    if (fy) {
      const [fyOb] = client
        .select()
        .from(fiscalOpeningBalances)
        .where(and(eq(fiscalOpeningBalances.fiscalYearId, fy.id), eq(fiscalOpeningBalances.accountId, accountId)))
        .all();
      if (fyOb) {
        opening = parseAmount(fyOb.openingBalance);
      }
      // add movements from fiscal year start to asOf
      const [movementRow] = client
        .select({
          total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, accountId), gte(ledgerEntries.entryDate, fy.startDate), lte(ledgerEntries.entryDate, asOf)))
        .all();
      opening += parseAmount(movementRow?.total || "0");
    } else {
      const [movementRow] = client
        .select({
          total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, accountId), lte(ledgerEntries.entryDate, asOf)))
        .all();
      opening += parseAmount(movementRow?.total || "0");
    }
    return opening;
  }

  async rollForwardOpeningBalances(
    fromFiscalYearId: number,
    to: { name: string; startDate: Date; endDate: Date },
    performedBy?: { userId?: number; role?: string },
  ) {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const [fromFy] = client.select().from(fiscalYears).where(eq(fiscalYears.id, fromFiscalYearId)).all();
      if (!fromFy) throw new Error("Source fiscal year not found");

      const nextFy = client
        .insert(fiscalYears)
        .values({
          name: to.name,
          startDate: to.startDate,
          endDate: to.endDate,
          status: "draft",
          createdBy: performedBy?.userId,
          createdAt: new Date(),
        } as any)
        .returning()
        .get();

      this.generatePeriodsForYear(client, nextFy.id, to.startDate, to.endDate);

      const accs = client.select().from(accounts).all();
      for (const acc of accs) {
        const closing = this.computeBalanceAsOf(client, acc.id, new Date(fromFy.endDate as any));
        client.insert(fiscalOpeningBalances).values({
          fiscalYearId: nextFy.id,
          accountId: acc.id,
          openingBalance: closing.toString(),
          createdBy: performedBy?.userId,
          createdAt: new Date(),
        } as any).run();
      }

      return nextFy as any;
    });
  }

  // Expense entries
  async getExpenses(): Promise<ExpenseEntry[]> {
    return db.select().from(expenseEntries).orderBy(desc(expenseEntries.expenseDate)).all();
  }

  async getExpense(id: number): Promise<ExpenseEntry | undefined> {
    const [expense] = db.select().from(expenseEntries).where(eq(expenseEntries.id, id)).all();
    return expense;
  }

  private nextExpenseNumber(client: DbClient): string {
    const year = new Date().getFullYear();
    const [last] = client.select().from(expenseEntries).orderBy(desc(expenseEntries.id)).limit(1).all();
    const next = last ? parseInt((last.voucherNo || "").split("-").pop() || "0") + 1 : 1;
    return `EXP-${year}-${String(next).padStart(5, "0")}`;
  }

  async createExpense(expense: InsertExpenseEntry, performedBy?: { userId?: number; role?: string }): Promise<ExpenseEntry> {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = expense.expenseDate ? new Date(expense.expenseDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "expense");

      const [expAcc] = client.select().from(accounts).where(eq(accounts.id, expense.expenseAccountId)).all();
      if (!expAcc || String(expAcc.type).toLowerCase() !== "expense") throw new Error("Expense account must be of type expense");
      const [payAcc] = client.select().from(accounts).where(eq(accounts.id, expense.payFromAccountId)).all();
      if (!payAcc) throw new Error("Pay-from account not found");

      const voucherNo = this.nextExpenseNumber(client);
      const amount = parseAmount(expense.amount || "0");
      if (amount <= 0) throw new Error("Amount must be greater than zero");

      const created = client.insert(expenseEntries).values({
        ...expense,
        voucherNo,
        amount: amount.toString(),
        expenseDate: postingDate,
        createdBy: performedBy?.userId,
        createdAt: new Date(),
      } as any).returning().get();

      // Dr Expense, Cr Cash/Bank/Other
      this.postLedgerEntry(client, {
        accountId: expense.expenseAccountId,
        transactionType: "debit",
        amount: amount.toString(),
        description: `Expense ${voucherNo}`,
        referenceType: "expense",
        referenceId: created.id,
        entryDate: postingDate,
      });
      this.postLedgerEntry(client, {
        accountId: expense.payFromAccountId,
        transactionType: "credit",
        amount: amount.toString(),
        description: `Expense ${voucherNo}`,
        referenceType: "expense",
        referenceId: created.id,
        entryDate: postingDate,
      });

      return created as any;
    });
  }

  async updateExpense(id: number, expense: Partial<InsertExpenseEntry>, performedBy?: { userId?: number; role?: string }): Promise<ExpenseEntry | undefined> {
    const existing = await this.getExpense(id);
    if (!existing) return undefined;

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = expense.expenseDate
        ? new Date(expense.expenseDate as any)
        : existing.expenseDate
          ? new Date(existing.expenseDate as any)
          : new Date();
      this.assertPostingAllowed(client, postingDate, "expense");

      const expenseAccountId = expense.expenseAccountId ?? existing.expenseAccountId;
      const payFromAccountId = expense.payFromAccountId ?? existing.payFromAccountId;

      const [expAcc] = client.select().from(accounts).where(eq(accounts.id, expenseAccountId)).all();
      if (!expAcc || String(expAcc.type).toLowerCase() !== "expense") throw new Error("Expense account must be of type expense");
      const [payAcc] = client.select().from(accounts).where(eq(accounts.id, payFromAccountId)).all();
      if (!payAcc) throw new Error("Pay-from account not found");

      const amount = parseAmount(expense.amount ?? existing.amount ?? "0");
      if (amount <= 0) throw new Error("Amount must be greater than zero");

      const priorEntries = tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "expense"), eq(ledgerEntries.referenceId, id)))
        .all();
      const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
      tx.delete(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "expense"), eq(ledgerEntries.referenceId, id)))
        .run();
      this.recomputeAccountBalances(client, affectedAccountIds);

      const updated = tx.update(expenseEntries).set({
        ...expense,
        expenseAccountId,
        payFromAccountId,
        amount: amount.toString(),
        expenseDate: postingDate,
        createdBy: existing.createdBy ?? performedBy?.userId,
      }).where(eq(expenseEntries.id, id)).returning().get();

      this.postLedgerEntry(client, {
        accountId: expenseAccountId,
        transactionType: "debit",
        amount: amount.toString(),
        description: `Expense ${existing.voucherNo}`,
        referenceType: "expense",
        referenceId: id,
        entryDate: postingDate,
      });
      this.postLedgerEntry(client, {
        accountId: payFromAccountId,
        transactionType: "credit",
        amount: amount.toString(),
        description: `Expense ${existing.voucherNo}`,
        referenceType: "expense",
        referenceId: id,
        entryDate: postingDate,
      });

      return updated as any;
    });
  }

  async deleteExpense(id: number): Promise<boolean> {
    const existing = await this.getExpense(id);
    if (!existing) return false;

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = existing.expenseDate ? new Date(existing.expenseDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "expense");

      const priorEntries = tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "expense"), eq(ledgerEntries.referenceId, id)))
        .all();
      const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
      tx.delete(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "expense"), eq(ledgerEntries.referenceId, id)))
        .run();
      this.recomputeAccountBalances(client, affectedAccountIds);
      tx.delete(expenseEntries).where(eq(expenseEntries.id, id)).run();
      return true;
    });
  }

  // Employees
  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees).orderBy(employees.name).all();
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [row] = db.select().from(employees).where(eq(employees.id, id)).all();
    return row;
  }

  private generateEmployeeCodeInternal(client: DbClient): string {
    const [last] = client.select({ code: employees.employeeCode }).from(employees).orderBy(desc(employees.id)).limit(1).all();
    const prefix = `EMP-${new Date().getFullYear()}-`;
    if (!last?.code || !last.code.startsWith(prefix)) {
      return `${prefix}${String(1).padStart(5, "0")}`;
    }
    const n = parseInt(last.code.slice(prefix.length), 10);
    const next = Number.isFinite(n) ? n + 1 : 1;
    return `${prefix}${String(next).padStart(5, "0")}`;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const employeeCode = this.generateEmployeeCodeInternal(client);

      const employeeAccount = tx.insert(accounts).values({
        name: `Employee Payable: ${employee.name} (${employeeCode})`,
        type: "employee" as any,
        openingBalance: "0",
        currentBalance: "0",
        isActive: true as any,
        isSystemAccount: false as any,
      }).returning().get();

      const created = tx.insert(employees).values({
        ...employee,
        employeeCode,
        accountId: employeeAccount.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning().get();

      return created as any;
    });
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    return db.transaction((tx) => {
      const [existing] = tx.select().from(employees).where(eq(employees.id, id)).all();
      if (!existing) return undefined;

      const updated = tx.update(employees).set({
        ...employee,
        updatedAt: new Date(),
      } as any).where(eq(employees.id, id)).returning().get();

      if (employee.name && existing.accountId) {
        tx.update(accounts).set({
          name: `Employee Payable: ${employee.name} (${existing.employeeCode})`,
        } as any).where(eq(accounts.id, existing.accountId)).run();
      }

      return updated as any;
    });
  }

  // Salary Structures
  async getEmployeeSalaryStructures(employeeId: number): Promise<EmployeeSalaryStructure[]> {
    return db
      .select()
      .from(employeeSalaryStructures)
      .where(eq(employeeSalaryStructures.employeeId, employeeId))
      .orderBy(desc(employeeSalaryStructures.effectiveFrom))
      .all();
  }

  async getEffectiveSalaryStructure(employeeId: number, asOf: Date): Promise<EmployeeSalaryStructure | undefined> {
    const [row] = db
      .select()
      .from(employeeSalaryStructures)
      .where(and(eq(employeeSalaryStructures.employeeId, employeeId), lte(employeeSalaryStructures.effectiveFrom, asOf)))
      .orderBy(desc(employeeSalaryStructures.effectiveFrom))
      .limit(1)
      .all();
    return row;
  }

  async createEmployeeSalaryStructure(data: InsertEmployeeSalaryStructure): Promise<EmployeeSalaryStructure> {
    const basic = parseAmount((data as any).basicSalary || "0");
    const allowances = parseAmount((data as any).allowances || "0");
    const deductions = parseAmount((data as any).deductions || "0");
    const gross = basic + allowances;
    const net = gross - deductions;
    if (net < 0) throw new Error("Net salary cannot be negative");

    const created = db.insert(employeeSalaryStructures).values({
      ...data,
      grossSalary: gross.toString(),
      netSalary: net.toString(),
      createdAt: new Date(),
    } as any).returning().get();

    return created as any;
  }

  async updateEmployeeSalaryStructure(
    employeeId: number,
    structureId: number,
    data: Partial<InsertEmployeeSalaryStructure>,
  ): Promise<EmployeeSalaryStructure | undefined> {
    return db.transaction((tx) => {
      const [existing] = tx
        .select()
        .from(employeeSalaryStructures)
        .where(and(eq(employeeSalaryStructures.id, structureId), eq(employeeSalaryStructures.employeeId, employeeId)))
        .all();
      if (!existing) return undefined;

      const basic =
        data.basicSalary !== undefined ? parseAmount(data.basicSalary as any) : parseAmount(existing.basicSalary);
      const allowances =
        data.allowances !== undefined ? parseAmount(data.allowances as any) : parseAmount(existing.allowances);
      const deductions =
        data.deductions !== undefined ? parseAmount(data.deductions as any) : parseAmount(existing.deductions);
      const gross = basic + allowances;
      const net = gross - deductions;
      if (net < 0) throw new Error("Net salary cannot be negative");

      const updateData: any = {
        grossSalary: gross.toString(),
        netSalary: net.toString(),
      };
      if (data.basicSalary !== undefined) updateData.basicSalary = data.basicSalary;
      if (data.allowances !== undefined) updateData.allowances = data.allowances;
      if (data.deductions !== undefined) updateData.deductions = data.deductions;
      if (data.effectiveFrom !== undefined) updateData.effectiveFrom = data.effectiveFrom as any;

      const updated = tx
        .update(employeeSalaryStructures)
        .set(updateData)
        .where(and(eq(employeeSalaryStructures.id, structureId), eq(employeeSalaryStructures.employeeId, employeeId)))
        .returning()
        .get();
      return updated as any;
    });
  }

  async deleteEmployeeSalaryStructure(employeeId: number, structureId: number): Promise<boolean> {
    const result = await db
      .delete(employeeSalaryStructures)
      .where(and(eq(employeeSalaryStructures.id, structureId), eq(employeeSalaryStructures.employeeId, employeeId)))
      .run();
    return result.changes > 0;
  }

  // Payroll
  async getPayrolls(filters?: { month?: string; status?: string; employeeId?: number }): Promise<Payroll[]> {
    const where: any[] = [];
    if (filters?.month) where.push(eq(payrolls.payrollMonth, filters.month));
    if (filters?.status) where.push(eq(payrolls.status, filters.status as any));
    if (filters?.employeeId) where.push(eq(payrolls.employeeId, filters.employeeId));

    return where.length
      ? db.select().from(payrolls).where(and(...(where as any))).orderBy(desc(payrolls.id)).all()
      : db.select().from(payrolls).orderBy(desc(payrolls.id)).all();
  }

  async generateMonthlyPayroll(month: string, performedBy?: { userId?: number; role?: string }) {
    parsePayrollMonth(month);
    const asOf = startOfPayrollMonth(month);

    return db.transaction((tx) => {
      const activeEmployees = tx.select().from(employees).where(eq(employees.status, "Active" as any)).all();
      let created = 0;
      let skipped = 0;

      for (const emp of activeEmployees) {
        const [existing] = tx
          .select({ id: payrolls.id })
          .from(payrolls)
          .where(and(eq(payrolls.payrollMonth, month), eq(payrolls.employeeId, emp.id)))
          .limit(1)
          .all();
        if (existing) {
          skipped += 1;
          continue;
        }

        const [structure] = tx
          .select()
          .from(employeeSalaryStructures)
          .where(and(eq(employeeSalaryStructures.employeeId, emp.id), lte(employeeSalaryStructures.effectiveFrom, asOf)))
          .orderBy(desc(employeeSalaryStructures.effectiveFrom))
          .limit(1)
          .all();

        const basic = parseAmount(structure?.basicSalary ?? emp.basicSalary ?? "0");
        const allowances = parseAmount(structure?.allowances ?? "0");
        const deductions = parseAmount(structure?.deductions ?? "0");
        const net = Math.max(basic + allowances - deductions, 0);

        const payroll = tx.insert(payrolls).values({
          payrollMonth: month,
          employeeId: emp.id,
          basicSalary: basic.toString(),
          allowances: allowances.toString(),
          deductions: deductions.toString(),
          netSalary: net.toString(),
          paymentStatus: "Unpaid",
          status: "generated",
          createdBy: performedBy?.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any).returning().get();

        tx.insert(payrollAuditLogs).values({
          payrollId: payroll.id,
          action: "generated",
          performedBy: performedBy?.userId,
          performedByRole: performedBy?.role,
          detailsJson: JSON.stringify({ month, employeeId: emp.id }),
        } as any).run();

        created += 1;
      }

      return { created, skipped };
    });
  }

  async approvePayroll(payrollId: number, performedBy?: { userId?: number; role?: string }, postingDate?: Date) {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const [payroll] = tx.select().from(payrolls).where(eq(payrolls.id, payrollId)).all();
      if (!payroll) return undefined;
      if (payroll.status !== "generated") throw new Error("Payroll cannot be approved in its current state");

      const [emp] = tx.select().from(employees).where(eq(employees.id, payroll.employeeId)).all();
      if (!emp) throw new Error("Employee not found");
      if (!emp.accountId) throw new Error("Employee payable account is not configured");

      const salaryExpense = this.ensureSystemAccount(client, "Salary Expense", "salary");

      const voucherDate = postingDate ?? new Date();
      this.assertPostingAllowed(client, voucherDate, "payroll approval");

      const month = payroll.payrollMonth;
      const amount = parseAmount(payroll.netSalary || "0").toString();
      const narration = `Payroll ${month} - ${emp.employeeCode} ${emp.name}`;

      const createdVoucher = (() => {
        const entries: JournalEntryInput[] = [
          { accountId: salaryExpense.id, entryType: "DEBIT", amount },
          { accountId: emp.accountId!, entryType: "CREDIT", amount },
        ];
        const { normalized, total } = this.normalizeJournalEntries(entries);

        const [last] = tx.select().from(journalVouchers).orderBy(desc(journalVouchers.id)).limit(1).all();
        const year = new Date().getFullYear();
        const nextNum = last ? parseInt(last.voucherNo.split("-").pop() || "0") + 1 : 1;
        const voucherNo = `JV-${year}-${String(nextNum).padStart(5, "0")}`;
        const amountInWords = `${toWords(Math.round(total))} only`;

        const v = tx.insert(journalVouchers).values({
          voucherNo,
          voucherDate,
          narration,
          status: "approved",
          totalAmount: total.toString(),
          amountInWords,
          createdBy: performedBy?.userId,
          approvedBy: performedBy?.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any).returning().get();

        for (const entry of normalized) {
          tx.insert(journalVoucherEntries).values({
            ...entry,
            journalVoucherId: v.id,
            amount: parseAmount(entry.amount).toString(),
          } as any).run();
        }

        this.postJournalToLedger(client, v as any, normalized);
        return v as any as JournalVoucher;
      })();

      const updated = tx.update(payrolls).set({
        status: "approved",
        approvedBy: performedBy?.userId,
        approvedByRole: performedBy?.role,
        approvedAt: new Date(),
        journalVoucherId: createdVoucher.id,
        updatedAt: new Date(),
      } as any).where(eq(payrolls.id, payrollId)).returning().get();

      tx.insert(payrollAuditLogs).values({
        payrollId,
        action: "approved",
        performedBy: performedBy?.userId,
        performedByRole: performedBy?.role,
        detailsJson: JSON.stringify({ journalVoucherId: createdVoucher.id, postingDate: voucherDate.toISOString() }),
      } as any).run();

      return updated as any;
    });
  }

  async paySalary(
    payrollId: number,
    payment: { method: "Cash" | "Bank"; paymentAccountId?: number; paymentDate?: Date },
    performedBy?: { userId?: number; role?: string },
  ) {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const [payroll] = tx.select().from(payrolls).where(eq(payrolls.id, payrollId)).all();
      if (!payroll) return undefined;
      if (payroll.status !== "approved") throw new Error("Payroll must be approved before payment");
      if (payroll.paymentStatus === "Paid") throw new Error("Payroll is already paid");

      const [emp] = tx.select().from(employees).where(eq(employees.id, payroll.employeeId)).all();
      if (!emp) throw new Error("Employee not found");
      if (!emp.accountId) throw new Error("Employee payable account is not configured");

      const amount = parseAmount(payroll.netSalary || "0").toString();
      const paymentDate = payment.paymentDate ?? new Date();
      this.assertPostingAllowed(client, paymentDate, "payroll payment");

      let creditAccountId: number;
      if (payment.method === "Cash") {
        const cash = this.ensureCashAccountInternal(client);
        creditAccountId = cash.id;
      } else {
        if (!payment.paymentAccountId) throw new Error("paymentAccountId is required for bank payments");
        const [bank] = tx.select().from(accounts).where(eq(accounts.id, payment.paymentAccountId)).all();
        if (!bank) throw new Error("Invalid bank account");
        if (String(bank.type).toLowerCase() !== "bank") throw new Error("paymentAccountId must be a bank account");
        creditAccountId = bank.id;
      }

      const narration = `Salary Payment ${payroll.payrollMonth} - ${emp.employeeCode} ${emp.name}`;

      const entries: JournalEntryInput[] = [
        { accountId: emp.accountId, entryType: "DEBIT", amount },
        { accountId: creditAccountId, entryType: "CREDIT", amount },
      ];
      const { normalized, total } = this.normalizeJournalEntries(entries);

      const [last] = tx.select().from(journalVouchers).orderBy(desc(journalVouchers.id)).limit(1).all();
      const year = new Date().getFullYear();
      const nextNum = last ? parseInt(last.voucherNo.split("-").pop() || "0") + 1 : 1;
      const voucherNo = `JV-${year}-${String(nextNum).padStart(5, "0")}`;
      const amountInWords = `${toWords(Math.round(total))} only`;

      const v = tx.insert(journalVouchers).values({
        voucherNo,
        voucherDate: paymentDate,
        narration,
        status: "approved",
        totalAmount: total.toString(),
        amountInWords,
        createdBy: performedBy?.userId,
        approvedBy: performedBy?.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning().get();

      for (const entry of normalized) {
        tx.insert(journalVoucherEntries).values({
          ...entry,
          journalVoucherId: v.id,
          amount: parseAmount(entry.amount).toString(),
        } as any).run();
      }

      this.postJournalToLedger(client, v as any, normalized);

      const updated = tx.update(payrolls).set({
        paymentStatus: "Paid",
        paymentMethod: payment.method,
        paymentAccountId: payment.method === "Bank" ? payment.paymentAccountId : null,
        status: "paid",
        paidAt: paymentDate,
        paymentJournalVoucherId: v.id,
        updatedAt: new Date(),
      } as any).where(eq(payrolls.id, payrollId)).returning().get();

      tx.insert(payrollAuditLogs).values({
        payrollId,
        action: "paid",
        performedBy: performedBy?.userId,
        performedByRole: performedBy?.role,
        detailsJson: JSON.stringify({ paymentJournalVoucherId: v.id, method: payment.method, paymentDate: paymentDate.toISOString() }),
      } as any).run();

      return updated as any;
    });
  }

  async getPayrollAudit(payrollId: number): Promise<PayrollAuditLog[]> {
    return db.select().from(payrollAuditLogs).where(eq(payrollAuditLogs.payrollId, payrollId)).orderBy(desc(payrollAuditLogs.performedAt)).all();
  }

  // Accounts
  async getAccounts(type?: string, active?: boolean): Promise<Account[]> {
    const filters: any[] = [];
    if (type) filters.push(eq(accounts.type, type as any));
    if (active !== undefined) filters.push(eq(accounts.isActive, active as any));

    if (filters.length > 0) {
      return db.select().from(accounts)
        .where(and(...filters as any))
        .orderBy(accounts.name)
        .all();
    }
    return db.select().from(accounts).orderBy(accounts.name).all();
  }

  async getAccount(id: number): Promise<Account | undefined> {
    const [account] = db.select().from(accounts).where(eq(accounts.id, id)).all();
    return account;
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values({
      ...account,
      currentBalance: account.openingBalance || "0",
    }).returning();
    return newAccount;
  }

  async updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined> {
    const [existing] = db.select().from(accounts).where(eq(accounts.id, id)).all();
    if (!existing) return undefined;

    const openingBalanceChanged =
      account.openingBalance !== undefined && account.openingBalance !== existing.openingBalance;
    const typeChanged = account.type !== undefined && account.type !== existing.type;

    const [updated] = await db.update(accounts).set(account).where(eq(accounts.id, id)).returning();
    if (!updated) return updated;

    if (openingBalanceChanged || typeChanged) {
      this.recomputeAccountBalances(db, [id]);
      const [refreshed] = db.select().from(accounts).where(eq(accounts.id, id)).all();
      return refreshed ?? updated;
    }

    return updated;
  }

  async deleteAccount(id: number): Promise<boolean> {
    const [existing] = db.select().from(accounts).where(eq(accounts.id, id)).all();
    if (!existing) return false;
    if (existing.isSystemAccount) {
      throw new Error("System accounts cannot be deleted");
    }
    try {
      const result = await db.delete(accounts).where(eq(accounts.id, id)).run();
      return result.changes > 0;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "SQLITE_CONSTRAINT_FOREIGNKEY") throw error;
      await db.update(accounts).set({ isActive: false as any }).where(eq(accounts.id, id)).run();
      return true;
    }
  }

  async updateAccountBalance(id: number, amount: string, type: 'add' | 'subtract'): Promise<void> {
    return this.updateAccountBalanceInternal(db, id, amount, type);
  }

  private updateAccountBalanceInternal(client: DbClient, id: number, amount: string, type: "add" | "subtract") {
    const [account] = client.select().from(accounts).where(eq(accounts.id, id)).all();
    const current = parseAmount(account?.currentBalance || "0");
    const amt = parseAmount(amount || "0");
    const newBalance = type === "add" ? current + amt : current - amt;

    client.update(accounts)
      .set({ currentBalance: newBalance.toString() })
      .where(eq(accounts.id, id));
  }

  private recomputeAccountBalances(client: DbClient, accountIds: number[]) {
    const uniqueIds = Array.from(new Set(accountIds)).filter((id) => Number.isFinite(id));
    for (const accountId of uniqueIds) {
      const [account] = client.select().from(accounts).where(eq(accounts.id, accountId)).all();
      if (!account) continue;
      const normal = normalSideForAccountType(account.type);
      const [row] = client
        .select({ total: ledgerSumByNormal(normal) })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.accountId, accountId))
        .all();
      const opening = parseAmount(account.openingBalance || "0");
      const delta = parseAmount(row?.total || "0");
      client
        .update(accounts)
        .set({ currentBalance: (opening + delta).toString() })
        .where(eq(accounts.id, accountId))
        .run();
    }
  }

  private applyAccountBalanceInternal(client: DbClient, account: Account, transactionType: "debit" | "credit", amount: number): number {
    const normal = normalSideForAccountType(account.type);
    const current = parseAmount(account.currentBalance || "0");
    let newBalance = current;
    if (transactionType === "debit") {
      newBalance = normal === "DEBIT" ? current + amount : current - amount;
    } else {
      newBalance = normal === "CREDIT" ? current + amount : current - amount;
    }
    client.update(accounts).set({ currentBalance: newBalance.toString() }).where(eq(accounts.id, account.id)).run();
    return newBalance;
  }

  private postLedgerEntry(client: DbClient, entry: Omit<InsertLedgerEntry, "balance">): LedgerEntry {
    const [account] = client.select().from(accounts).where(eq(accounts.id, entry.accountId)).all();
    if (!account) throw new Error(`Account not found (${entry.accountId})`);
    const amount = parseAmount(entry.amount || "0");
    const newBalance = this.applyAccountBalanceInternal(client, account as any, entry.transactionType as any, amount);

    const newEntry = client.insert(ledgerEntries).values({
      ...entry,
      balance: newBalance.toString(),
    }).returning().get();

    // Auto record cash movement for system Cash in Hand
    if (account.isSystemAccount && account.name === "Cash in Hand") {
      const tx: CashTxInput = {
        accountId: account.id,
        transactionType: entry.transactionType === "debit" ? "DEBIT" : "CREDIT",
        transactionDate: entry.entryDate || new Date(),
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        amount: entry.amount,
        narration: entry.description,
      };
      client.insert(cashTransactions).values(tx).run();
    }

    return newEntry as any;
  }

  private postBalancedLedgerEntries(client: DbClient, entries: Omit<InsertLedgerEntry, "balance">[], context: string) {
    let debitTotal = 0;
    let creditTotal = 0;
    for (const entry of entries) {
      const amount = parseAmount(entry.amount || "0");
      if (entry.transactionType === "debit") debitTotal += amount;
      if (entry.transactionType === "credit") creditTotal += amount;
    }
    if (Math.abs(debitTotal - creditTotal) > 0.0001) {
      throw new Error(`${context} ledger postings are not balanced (debit ${debitTotal} vs credit ${creditTotal})`);
    }
    for (const entry of entries) {
      this.postLedgerEntry(client, entry);
    }
  }
  private ensureCashAccountInternal(client: DbClient): Account {
    const existing = client.select().from(accounts)
      .where(and(eq(accounts.name, "Cash in Hand"), eq(accounts.isSystemAccount, true as any)))
      .all();
    if (existing.length > 0) return existing[0];
    const created = client.insert(accounts).values({
      name: "Cash in Hand",
      type: "asset" as any,
      openingBalance: "0",
      currentBalance: "0",
      isSystemAccount: true,
    }).returning().get();
    return created as any;
  }

  private ensureSystemAccount(client: DbClient, name: string, type: Account["type"] | string): Account {
    const existing = client
      .select()
      .from(accounts)
      .where(and(eq(accounts.name, name), eq(accounts.isSystemAccount, true as any)))
      .all();
    if (existing.length > 0) return existing[0];

    const created = client.insert(accounts).values({
      name,
      type: type as any,
      openingBalance: "0",
      currentBalance: "0",
      isSystemAccount: true,
    }).returning().get();
    return created as any;
  }

  private ensurePurchaseChargeAccount(client: DbClient, type: string): Account {
    const label = (() => {
      switch (type) {
        case "weight":
          return "Purchase - Weight Charges";
        case "freight":
          return "Purchase - Freight Charges";
        case "loading_filling":
          return "Purchase - Loading/Unloading Charges";
        case "market_fee":
          return "Purchase - Market Fee";
        case "mitha_sukri":
          return "Purchase - Mitha Sukri";
        case "phone_analysis":
          return "Purchase - Phone/Analysis";
        case "brokerage":
          return "Purchase - Brokerage";
        case "commission":
          return "Purchase - Commission";
        case "bardana":
          return "Purchase - Bardana";
        case "broken_allowance":
          return "Purchase - Broken Allowance";
        case "other":
        default:
          return "Purchase - Other Charges";
      }
    })();
    return this.ensureSystemAccount(client, label, "expense");
  }

  private ensureSalesChargeAccount(client: DbClient, label: "LOADING" | "WEIGHING" | "OTHER"): Account {
    const name = (() => {
      switch (label) {
        case "LOADING":
          return "Sales - Loading Charges";
        case "WEIGHING":
          return "Sales - Weighing Charges";
        case "OTHER":
        default:
          return "Sales - Other Charges";
      }
    })();
    return this.ensureSystemAccount(client, name, "income");
  }

  private ensureFiscalCalendarInitialized(client: DbClient, performedBy?: { userId?: number }) {
    const existing = client.select().from(fiscalYears).all();
    if (existing.length > 0) return;

    const startYear = 2000;
    const currentYear = new Date().getFullYear();
    const allAccounts = client.select().from(accounts).all();

    for (let year = startYear; year <= currentYear; year += 1) {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      const status = year === currentYear ? "open" : "closed";

      const fy = client.insert(fiscalYears).values({
        name: `FY-${year}`,
        startDate: start,
        endDate: end,
        status,
        createdBy: performedBy?.userId,
        createdAt: new Date(),
      } as any).returning().get();

      for (let m = 0; m < 12; m++) {
        const dt = new Date(year, m, 1);
        client.insert(fiscalPeriods).values({
          fiscalYearId: fy.id,
          yearMonth: toYearMonth(dt),
          periodStart: startOfMonth(dt),
          periodEnd: endOfMonth(dt),
          isClosed: status !== "open" ? (true as any) : (false as any),
        } as any).run();
      }

      for (const acc of allAccounts) {
        client.insert(fiscalOpeningBalances).values({
          fiscalYearId: fy.id,
          accountId: acc.id,
          openingBalance: acc.openingBalance || "0",
          createdBy: performedBy?.userId,
          createdAt: new Date(),
        } as any).run();
      }
    }
  }

  private assertFiscalPeriodOpen(client: DbClient, postingDate: Date, context: string) {
    this.ensureFiscalCalendarInitialized(client);

    const [fy] = client
      .select()
      .from(fiscalYears)
      .where(and(lte(fiscalYears.startDate, postingDate), gte(fiscalYears.endDate, postingDate)))
      .all();

    if (!fy) {
      throw new Error(`No fiscal year configured for ${context} (${postingDate.toISOString().slice(0, 10)})`);
    }
    if (fy.status !== "open") {
      throw new Error(`Fiscal year is not open for ${context} (${fy.name})`);
    }

    const [period] = client
      .select()
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.fiscalYearId, fy.id), lte(fiscalPeriods.periodStart, postingDate), gte(fiscalPeriods.periodEnd, postingDate)))
      .all();

    if (!period) {
      throw new Error(`No fiscal period configured for ${context} (${postingDate.toISOString().slice(0, 10)})`);
    }
    if (period.isClosed) {
      throw new Error(`Fiscal period is closed for ${context} (${period.yearMonth})`);
    }

    return { fiscalYear: fy, fiscalPeriod: period };
  }

  private assertPeriodNotLocked(client: DbClient, postingDate: Date, context: string) {
    const locks = client
      .select()
      .from(periodLocks)
      .where(and(lte(periodLocks.fromDate, postingDate), gte(periodLocks.toDate, postingDate)))
      .all();
    if (locks.length > 0) {
      const lock = locks[0];
      throw new Error(
        `Period is locked for ${context} (${new Date(lock.fromDate as any).toISOString().slice(0, 10)} to ${new Date(lock.toDate as any).toISOString().slice(0, 10)})`,
      );
    }
  }

  private assertPostingAllowed(client: DbClient, postingDate: Date, context: string) {
    const safeDate = toValidDate(postingDate);
    const minAllowed = new Date(1980, 0, 1);
    minAllowed.setHours(0, 0, 0, 0);
    if (safeDate < minAllowed) {
      throw new Error(
        `Date must be on or after ${minAllowed.toISOString().slice(0, 10)} for ${context}`,
      );
    }
    this.assertPeriodNotLocked(client, safeDate, context);
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(products.name).all();
  }

  async getActiveProducts(): Promise<Product[]> {
    return db
      .select()
      .from(products)
      .where(eq(products.isActive, true as any))
      .orderBy(products.name)
      .all();
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = db.select().from(products).where(eq(products.id, id)).all();
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(product).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<boolean> {
    try {
      const result = await db.delete(products).where(eq(products.id, id)).run();
      return result.changes > 0;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "SQLITE_CONSTRAINT_FOREIGNKEY") throw error;

      const [existing] = db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, id))
        .all();
      if (!existing) return false;

      await db.update(products).set({ isActive: false as any }).where(eq(products.id, id)).run();
      return true;
    }
  }

  async updateProductStock(id: number, quantity: string, type: 'add' | 'subtract'): Promise<void> {
    return this.updateProductStockInternal(db, id, quantity, type);
  }

  private updateProductStockInternal(client: DbClient, id: number, quantity: string, type: "add" | "subtract") {
    const [product] = client.select().from(products).where(eq(products.id, id)).all();
    const current = parseAmount(product?.currentStock || "0");
    const qty = parseAmount(quantity || "0");
    const newStock = type === "add" ? current + qty : current - qty;

    if (type === "subtract" && newStock < 0) {
      throw new Error(`Insufficient stock for product ${product?.name || id}`);
    }

    client.update(products)
      .set({ currentStock: newStock.toString() })
      .where(eq(products.id, id))
      .run();
  }

  // Purchases
  async getPurchases(): Promise<Purchase[]> {
    return db.select().from(purchases).where(isNull(purchases.deletedAt)).orderBy(desc(purchases.id)).all(); // Use ID for stability
  }

  async getPurchase(id: number): Promise<Purchase | undefined> {
    const [purchase] = db.select().from(purchases).where(and(eq(purchases.id, id), isNull(purchases.deletedAt))).all();
    return purchase;
  }

  async getPurchaseWithDetails(id: number): Promise<(Purchase & { items: PurchaseItem[]; charges: PurchaseCharge[] }) | undefined> {
    const purchase = await this.getPurchase(id);
    if (!purchase) return undefined;
    const [items, charges] = await Promise.all([
      this.getPurchaseItems(id),
      this.getPurchaseCharges(id),
    ]);
    return { ...purchase, items, charges };
  }

  async getNextPurchaseInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(purchases)
      .orderBy(desc(purchases.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0") + 1 : 1;
    return `PUR-${year}-${String(nextNum).padStart(4, "0")}`;
  }

  private computeNextBillNumber(client: DbClient, year: number): string {
    const [last] = client.select().from(purchases)
      .where(sql`bill_no IS NOT NULL AND bill_no != ''`)
      .orderBy(desc(purchases.id))
      .limit(1)
      .all();

    const lastSeq = last?.billNo ? parseInt((last.billNo as string).split("-").pop() || "0") : 0;
    const nextNum = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
    return `BILL-${year}-${String(nextNum).padStart(5, "0")}`;
  }

  async getNextPurchaseBillNumber(): Promise<string> {
    const year = new Date().getFullYear();
    return this.computeNextBillNumber(db, year);
  }

  private normalizePurchaseItem(item: PurchaseItemInput, moundBaseKg = 40) {
    const serialNo = item.serialNo ?? null;
    const bags = parseAmount(item.bags);
    const filling = parseAmount(item.fillingPerBagKg);
    const looseKgs = parseAmount(item.looseKgs || 0);
    const lessKg = parseAmount(item.lessKg || 0);
    const bardanaKatKg = parseAmount(item.bardanaKatKg || 0);
    const rate = parseAmount(item.rate);
    const grossWeightKg = (bags * filling) + looseKgs;
    const netWeightKg = Math.max(grossWeightKg - lessKg - bardanaKatKg, 0);
    const moundQty = netWeightKg / moundBaseKg;
    const moundWhole = Math.floor(moundQty);
    const moundRemainderKg = Math.max(netWeightKg - (moundWhole * moundBaseKg), 0);

    const unit = item.rateUnit;
    let billingQty = netWeightKg;
    if (unit === "mound") billingQty = netWeightKg / moundBaseKg;
    if (unit === "bag") billingQty = bags;
    if (unit === "quintal") billingQty = netWeightKg / 100;
    if (unit === "ton") billingQty = netWeightKg / 1000;

    const amount = rate * billingQty;

    return {
      ...item,
      serialNo: serialNo ?? undefined,
      marka: item.marka || null,
      bags: bags.toString(),
      fillingPerBagKg: filling.toString(),
      looseKgs: looseKgs.toString(),
      grossWeightKg: grossWeightKg.toString(),
      lessKg: lessKg.toString(),
      bardanaKatKg: bardanaKatKg.toString(),
      netWeightKg: netWeightKg.toString(),
      moundQty: moundQty.toString(),
      moundRemainderKg: moundRemainderKg.toString(),
      rate: rate.toString(),
      amount: amount.toString(),
    };
  }

  private sumCharges(charges: PurchaseChargeInput[]) {
    let add = 0;
    let less = 0;
    for (const c of charges) {
      const amt = parseAmount(c.amount);
      if (c.mode === "less") less += amt; else add += amt;
    }
    return { add, less };
  }

  async createPurchase(purchase: InsertPurchase, items: PurchaseItemInput[], charges: PurchaseChargeInput[], moundBaseKg = 40): Promise<Purchase> {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = purchase.purchaseDate ? new Date(purchase.purchaseDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "purchase");

      const year = new Date().getFullYear();
      const [last] = tx.select().from(purchases).orderBy(desc(purchases.id)).limit(1).all();
      const nextNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0") + 1 : 1;
      const invoiceNumber = `PUR-${year}-${String(nextNum).padStart(4, "0")}`;
      const billYear = purchase.purchaseDate ? new Date(purchase.purchaseDate).getFullYear() : year;
      const billNo = purchase.billNo && purchase.billNo.trim() !== "" ? purchase.billNo : this.computeNextBillNumber(tx as unknown as DbClient, billYear);

      let subtotal = 0;
      let totalBags = 0;
      let totalGrossWeightKg = 0;
      let totalNetWeightKg = 0;

      const normalizedItems = items.map((item, idx) => {
        const normalized = this.normalizePurchaseItem({
          serialNo: item.serialNo ?? idx + 1,
          ...item,
        }, moundBaseKg);
        subtotal += parseAmount(normalized.amount);
        totalBags += parseAmount(normalized.bags);
        totalGrossWeightKg += parseAmount(normalized.grossWeightKg);
        totalNetWeightKg += parseAmount(normalized.netWeightKg);
        return normalized;
      });

      const totalMoundQty = totalNetWeightKg / moundBaseKg;
      const totalMoundWhole = Math.floor(totalMoundQty);
      const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundWhole * moundBaseKg), 0);

      const { add: chargesAdd, less: chargesLess } = this.sumCharges(charges);
      const brokerCommissionPercent = parseAmount(purchase.brokerCommissionPercent || "0");
      const brokerCommission = (subtotal * brokerCommissionPercent) / 100;

      const lineSubtotal = subtotal + brokerCommission;
      const taxAmount = parseAmount((purchase as any).taxAmount || 0);
      const grandAmount = lineSubtotal + chargesAdd - chargesLess + taxAmount;
      const paidAmount = 0;
      const balanceDue = grandAmount;
      const amountInWords = `${toWords(Math.round(grandAmount))} only`;

      const newPurchase = tx.insert(purchases).values({
        ...purchase,
        invoiceNumber,
        billNo,
        subtotal: lineSubtotal.toString(),
        totalAmount: grandAmount.toString(),
        totalBags: totalBags.toString(),
        totalGrossWeightKg: totalGrossWeightKg.toString(),
        totalNetWeightKg: totalNetWeightKg.toString(),
        totalMoundQty: totalMoundQty.toString(),
        totalMoundRemainderKg: totalMoundRemainderKg.toString(),
        chargesAdd: chargesAdd.toString(),
        chargesLess: chargesLess.toString(),
        taxAmount: taxAmount.toString(),
        taxTypeId: (purchase as any).taxTypeId ?? null,
        buyerAmount: grandAmount.toString(),
        balanceDue: balanceDue.toString(),
        brokerCommissionAmount: brokerCommission.toString(),
        paidAmount: paidAmount.toString(),
        amountInWords,
      }).returning().get();

      for (const item of normalizedItems) {
        tx.insert(purchaseItems).values({
          ...item,
          purchaseId: newPurchase.id,
        }).run();

        const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
        const currentStock = parseAmount(product?.currentStock || "0");
        const currentAvg = parseAmount(product?.avgPurchasePrice || "0");
        const qtyKg = parseAmount(item.netWeightKg); // maintain stock in kg
        const pricePerKg = parseAmount(item.amount) / Math.max(qtyKg, 1); // effective rate per kg
        const newStock = currentStock + qtyKg;

        const totalValue = (currentStock * currentAvg) + (qtyKg * pricePerKg);
        const newAvg = newStock > 0 ? totalValue / newStock : 0;

        tx.update(products)
          .set({
            currentStock: newStock.toString(),
            avgPurchasePrice: newAvg.toString(),
          })
          .where(eq(products.id, item.productId))
          .run();
      }

      for (const charge of charges) {
        tx.insert(purchaseCharges).values({
          ...charge,
          purchaseId: newPurchase.id,
          amount: parseAmount(charge.amount).toString(),
        }).run();
      }

      // Double-entry: split purchase into base/tax/charge lines so ledgers show each impact.
      const debitAccountId = purchase.expenseAccountId ?? this.ensureSystemAccount(client, "Inventory", "asset").id;
      const supplierAccountId = purchase.supplierId;
      const baseAmount = Math.max(subtotal, 0);
      const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
      const purchaseBaseLabel = `PURCHASE ${invoiceNumber}`;

      const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

      if (baseAmount > 0) {
        const amount = baseAmount.toString();
        pushLine({
          accountId: debitAccountId,
          transactionType: "debit",
          amount,
          description: purchaseBaseLabel,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: "credit",
          amount,
          description: purchaseBaseLabel,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
      }

      if (brokerCommission > 0) {
        const amount = brokerCommission.toString();
        const commissionLabel = "BROKER COMMISSION";
        pushLine({
          accountId: debitAccountId,
          transactionType: "debit",
          amount,
          description: commissionLabel,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: "credit",
          amount,
          description: commissionLabel,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
      }

      const chargeLabel = (type: string) => {
        switch (type) {
          case "weight":
            return "WEIGHT ADD";
          case "freight":
            return "FREIGHT";
          case "loading_filling":
            return "LOADING/UNLOADING";
          case "market_fee":
            return "MARKET FEE";
          case "mitha_sukri":
            return "MITHA SUKRI";
          case "phone_analysis":
            return "PHONE/ANALYSIS";
          case "brokerage":
            return "BROKERAGE";
          case "commission":
            return "COMMISSION";
          case "bardana":
            return "BARDANA";
          case "broken_allowance":
            return "BROKEN ALLOWANCE";
          case "accountant_clerk":
            return "ACCOUNTANT / CLERK";
          case "other":
          default:
            return "OTHER";
        }
      };

      for (const charge of charges) {
        const amt = parseAmount(charge.amount);
        if (amt <= 0) continue;
        const entryType = charge.mode === "less" ? "credit" : "debit";
        const label = chargeLabel(charge.type);
        const targetAccountId = charge.accountId ?? this.ensurePurchaseChargeAccount(client, charge.type).id;
        pushLine({
          accountId: targetAccountId,
          transactionType: entryType,
          amount: amt.toString(),
          description: label,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: entryType === "debit" ? "credit" : "debit",
          amount: amt.toString(),
          description: label,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
      }

      if (taxAmount > 0) {
        const taxTypeId = (purchase as any).taxTypeId as number | undefined;
        let taxAccountId: number;
        if (taxTypeId) {
          const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId)).all();
          const taxAcct = tt?.inputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.inputAccountId)).all()[0] : undefined;
          taxAccountId = taxAcct?.id ?? this.ensureSystemAccount(client, "Tax Input", "asset").id;
        } else {
          taxAccountId = this.ensureSystemAccount(client, "Tax Input", "asset").id;
        }
        const taxLabel = "TAX";
        pushLine({
          accountId: taxAccountId,
          transactionType: "debit",
          amount: taxAmount.toString(),
          description: taxLabel,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: "credit",
          amount: taxAmount.toString(),
          description: taxLabel,
          referenceType: "purchase",
          referenceId: newPurchase.id,
          entryDate: postingDate,
        });
        tx.insert(taxLedgers).values({
          taxTypeId: taxTypeId ?? null,
          sourceType: "purchase",
          sourceId: newPurchase.id,
          taxBase: lineSubtotal.toString(),
          taxAmount: taxAmount.toString(),
          postingDate,
          createdAt: new Date(),
        } as any).run();
      }

      this.postBalancedLedgerEntries(client, ledgerLines, `purchase ${invoiceNumber}`);

      return newPurchase;
    });
  }

  async getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]> {
    return db.select().from(purchaseItems).where(and(eq(purchaseItems.purchaseId, purchaseId), isNull(purchaseItems.deletedAt))).all();
  }

  async getPurchaseCharges(purchaseId: number): Promise<PurchaseCharge[]> {
    return db.select().from(purchaseCharges).where(eq(purchaseCharges.purchaseId, purchaseId)).all();
  }

  async updatePurchase(id: number, purchase: Partial<InsertPurchase>, items: PurchaseItemInput[], charges: PurchaseChargeInput[], moundBaseKg = 40): Promise<Purchase | undefined> {
    const existing = await this.getPurchaseWithDetails(id);
    if (!existing) return undefined;

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = purchase.purchaseDate
        ? new Date(purchase.purchaseDate as any)
        : existing.purchaseDate
          ? new Date(existing.purchaseDate as any)
          : new Date();
      this.assertPostingAllowed(client, postingDate, "purchase");

      // Remove previous ledger entries instead of posting reversals.
      const priorEntries = tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, id)))
        .all();
      const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
      tx.delete(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, id)))
        .run();
      this.recomputeAccountBalances(client, affectedAccountIds);

      // Rollback previous stock impact
      for (const item of existing.items) {
        this.updateProductStockInternal(client, item.productId, item.netWeightKg, "subtract");
      }

      // Rebuild new items/totals
      let subtotal = 0;
      let totalBags = 0;
      let totalGrossWeightKg = 0;
      let totalNetWeightKg = 0;

      const normalizedItems = items.map((item, idx) => {
        const normalized = this.normalizePurchaseItem({
          serialNo: item.serialNo ?? idx + 1,
          ...item,
        }, moundBaseKg);
        subtotal += parseAmount(normalized.amount);
        totalBags += parseAmount(normalized.bags);
        totalGrossWeightKg += parseAmount(normalized.grossWeightKg);
        totalNetWeightKg += parseAmount(normalized.netWeightKg);
        return normalized;
      });

      const totalMoundQty = totalNetWeightKg / moundBaseKg;
      const totalMoundWhole = Math.floor(totalMoundQty);
      const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundWhole * moundBaseKg), 0);

      const { add: chargesAdd, less: chargesLess } = this.sumCharges(charges);
      const brokerCommissionPercent = parseAmount((purchase as any).brokerCommissionPercent ?? existing.brokerCommissionPercent ?? "0");
      const brokerCommission = (subtotal * brokerCommissionPercent) / 100;

      const lineSubtotal = subtotal + brokerCommission;
      const taxAmount = parseAmount((purchase as any).taxAmount ?? existing.taxAmount ?? 0);
      const grandAmount = lineSubtotal + chargesAdd - chargesLess + taxAmount;
      const paidAmount = parseAmount(existing.paidAmount ?? 0);
      const balanceDue = grandAmount - paidAmount;
      const amountInWords = `${toWords(Math.round(grandAmount))} only`;

      const updatedPurchase = tx.update(purchases).set({
        ...purchase,
        subtotal: lineSubtotal.toString(),
        totalAmount: grandAmount.toString(),
        totalBags: totalBags.toString(),
        totalGrossWeightKg: totalGrossWeightKg.toString(),
        totalNetWeightKg: totalNetWeightKg.toString(),
        totalMoundQty: totalMoundQty.toString(),
        totalMoundRemainderKg: totalMoundRemainderKg.toString(),
        chargesAdd: chargesAdd.toString(),
        chargesLess: chargesLess.toString(),
        buyerAmount: grandAmount.toString(),
        balanceDue: balanceDue.toString(),
        brokerCommissionAmount: brokerCommission.toString(),
        paidAmount: paidAmount.toString(),
        amountInWords,
      }).where(eq(purchases.id, id)).returning().get();

      // Replace items
      tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id)).run();
      for (const item of normalizedItems) {
        tx.insert(purchaseItems).values({ ...item, purchaseId: id }).run();
        this.updateProductStockInternal(client, item.productId, item.netWeightKg, "add");
      }

      // Replace charges
      tx.delete(purchaseCharges).where(eq(purchaseCharges.purchaseId, id)).run();
      for (const charge of charges) {
        tx.insert(purchaseCharges).values({
          ...charge,
          purchaseId: id,
          amount: parseAmount(charge.amount).toString(),
        }).run();
      }

      // Post fresh double-entry for updated purchase with split charge lines.
      const debitAccountId = purchase.expenseAccountId ?? existing.expenseAccountId ?? this.ensureSystemAccount(client, "Inventory", "asset").id;
      const supplierAccountId = purchase.supplierId ?? existing.supplierId;
      const baseAmount = Math.max(subtotal, 0);
      const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
      const purchaseBaseLabel = `PURCHASE ${existing.invoiceNumber}`;

      const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

      if (baseAmount > 0) {
        const amount = baseAmount.toString();
        pushLine({
          accountId: debitAccountId,
          transactionType: "debit",
          amount,
          description: purchaseBaseLabel,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: "credit",
          amount,
          description: purchaseBaseLabel,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
      }

      if (brokerCommission > 0) {
        const amount = brokerCommission.toString();
        const commissionLabel = "BROKER COMMISSION";
        pushLine({
          accountId: debitAccountId,
          transactionType: "debit",
          amount,
          description: commissionLabel,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: "credit",
          amount,
          description: commissionLabel,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
      }

      const chargeLabel = (type: string) => {
        switch (type) {
          case "weight":
            return "WEIGHT ADD";
          case "freight":
            return "FREIGHT";
          case "loading_filling":
            return "LOADING/UNLOADING";
          case "market_fee":
            return "MARKET FEE";
          case "mitha_sukri":
            return "MITHA SUKRI";
          case "phone_analysis":
            return "PHONE/ANALYSIS";
          case "brokerage":
            return "BROKERAGE";
          case "commission":
            return "COMMISSION";
          case "bardana":
            return "BARDANA";
          case "broken_allowance":
            return "BROKEN ALLOWANCE";
          case "accountant_clerk":
            return "ACCOUNTANT / CLERK";
          case "other":
          default:
            return "OTHER";
        }
      };

      for (const charge of charges) {
        const amt = parseAmount(charge.amount);
        if (amt <= 0) continue;
        const entryType = charge.mode === "less" ? "credit" : "debit";
        const label = chargeLabel(charge.type);
        const targetAccountId = charge.accountId ?? this.ensurePurchaseChargeAccount(client, charge.type).id;
        pushLine({
          accountId: targetAccountId,
          transactionType: entryType,
          amount: amt.toString(),
          description: label,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: entryType === "debit" ? "credit" : "debit",
          amount: amt.toString(),
          description: label,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
      }

      if (taxAmount > 0) {
        const taxTypeId = (purchase as any).taxTypeId ?? existing.taxTypeId;
        let taxAccountId: number;
        if (taxTypeId) {
          const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId as any)).all();
          const taxAcct = tt?.inputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.inputAccountId)).all()[0] : undefined;
          taxAccountId = taxAcct?.id ?? this.ensureSystemAccount(client, "Tax Input", "asset").id;
        } else {
          taxAccountId = this.ensureSystemAccount(client, "Tax Input", "asset").id;
        }
        const taxLabel = "TAX";
        pushLine({
          accountId: taxAccountId,
          transactionType: "debit",
          amount: taxAmount.toString(),
          description: taxLabel,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: supplierAccountId,
          transactionType: "credit",
          amount: taxAmount.toString(),
          description: taxLabel,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
      }

      this.postBalancedLedgerEntries(client, ledgerLines, `purchase ${existing.invoiceNumber}`);

      return updatedPurchase;
    });
  }

  async deletePurchase(id: number, deletedBy?: number): Promise<boolean> {
    const existing = await this.getPurchaseWithDetails(id);
    if (!existing) return false;
    if (existing.deletedAt) return false;
    const paidAmount = parseAmount(existing.paidAmount || "0");
    if (paidAmount > 0) {
      throw new Error("Cannot delete a purchase that has recorded payments");
    }

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = existing.purchaseDate ? new Date(existing.purchaseDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "purchase");

      // Remove prior ledger entries instead of posting reversals.
      const priorEntries = tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, id)))
        .all();
      const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
      tx.delete(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, id)))
        .run();
      this.recomputeAccountBalances(client, affectedAccountIds);

      // Rollback stock impact
      for (const item of existing.items.filter((i) => !i.deletedAt)) {
        this.updateProductStockInternal(client, item.productId, item.netWeightKg, "subtract");
      }

      // Soft delete related rows
      tx.update(purchaseItems).set({ deletedAt: new Date(), deletedBy }).where(eq(purchaseItems.purchaseId, id)).run();
      tx.update(purchases).set({ deletedAt: new Date(), deletedBy }).where(eq(purchases.id, id)).run();
      tx.delete(purchaseCharges).where(eq(purchaseCharges.purchaseId, id)).run();
      tx.delete(taxLedgers).where(and(eq(taxLedgers.sourceType, "purchase"), eq(taxLedgers.sourceId, id))).run();

      return true;
    });
  }

  // Processing
  async getProcessingBatches(): Promise<Processing[]> {
    return db.select().from(processing).orderBy(desc(processing.startDate)).all();
  }

  async getProcessingBatch(id: number): Promise<Processing | undefined> {
    const [batch] = db.select().from(processing).where(eq(processing.id, id)).all();
    return batch;
  }

  async getNextBatchNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(processing)
      .orderBy(desc(processing.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.batchNumber.split('-').pop() || '0') + 1 : 1;
    return `PRO-${year}-${String(nextNum).padStart(3, '0')}`;
  }

  async createProcessing(batch: InsertProcessing): Promise<Processing> {
    return db.transaction((tx) => {
      const year = new Date().getFullYear();
      const [last] = tx.select().from(processing).orderBy(desc(processing.id)).limit(1).all();
      const nextNum = last ? parseInt(last.batchNumber.split("-").pop() || "0") + 1 : 1;
      const batchNumber = `PRO-${year}-${String(nextNum).padStart(3, "0")}`;

      const client = tx as unknown as DbClient;

      // Reduce stock for source product
      this.updateProductStockInternal(client, batch.sourceProductId, batch.sourceQuantity, "subtract");

      const insertResult = tx.insert(processing).values({
        ...batch,
        batchNumber,
      }).run();
      const newId = Number(insertResult.lastInsertRowid);
      const [newBatch] = tx.select().from(processing).where(eq(processing.id, newId)).all();

      return newBatch;
    });
  }

  async updateProcessing(id: number, batch: Partial<InsertProcessing>): Promise<Processing | undefined> {
    const existingBatch = await this.getProcessingBatch(id);
    if (!existingBatch) return undefined;

    return db.transaction((tx) => {
      const updatePayload: Partial<InsertProcessing> = { ...batch };
      const client = tx as unknown as DbClient;

      if (batch.status === "in_progress" && existingBatch.status === "pending") {
        updatePayload.startDate = new Date();
      }

      if (batch.status === "completed" && existingBatch.status !== "completed") {
        const outputProductId = batch.outputProductId || existingBatch.outputProductId;
        const outputQuantity = batch.outputQuantity || existingBatch.outputQuantity;

        if (outputProductId && outputQuantity) {
          this.updateProductStockInternal(
            client,
            outputProductId,
            outputQuantity,
            "add",
          );
        }
        updatePayload.completedDate = new Date();
      }

      tx.update(processing).set(updatePayload).where(eq(processing.id, id)).run();
      const [updated] = tx.select().from(processing).where(eq(processing.id, id)).all();
      return updated;
    });
  }

  // Sales
  async getSales(): Promise<Sale[]> {
    return db.select().from(sales).orderBy(desc(sales.saleDate)).all();
  }

  async getSale(id: number): Promise<Sale | undefined> {
    const [sale] = db.select().from(sales).where(eq(sales.id, id)).all();
    return sale;
  }

  async getNextSaleInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(sales)
      .orderBy(desc(sales.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0") + 1 : 1;
    return `SAL-${year}-${String(nextNum).padStart(4, "0")}`;
  }

  async getNextGatePassNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(sales)
      .orderBy(desc(sales.id))
      .limit(1)
      .all();

    const nextNum = last ? parseInt(last.gatePassNumber?.split("-").pop() || "0") + 1 : 1;
    return `GP-${year}-${String(nextNum).padStart(4, "0")}`;
  }

  async createSale(sale: InsertSale, items: SaleItemInput[]): Promise<Sale> {
    return db.transaction((tx) => {
      const year = new Date().getFullYear();
      const [lastSale] = tx.select().from(sales).orderBy(desc(sales.id)).limit(1).all();
      const nextInvoice = lastSale ? parseInt(lastSale.invoiceNumber.split("-").pop() || "0") + 1 : 1;
      const invoiceNumber = `SAL-${year}-${String(nextInvoice).padStart(4, "0")}`;

      const [lastGp] = tx.select().from(sales).orderBy(desc(sales.id)).limit(1).all();
      const nextGp = lastGp ? parseInt(lastGp.gatePassNumber?.split("-").pop() || "0") + 1 : 1;
      const gatePassNumber = `GP-${year}-${String(nextGp).padStart(4, "0")}`;

      const client = tx as unknown as DbClient;
      const postingDate = sale.saleDate ? new Date(sale.saleDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "sale");

      let subtotal = 0;
      const normalizedItems = items.map((item) => {
        const qty = parseAmount(item.quantity);
        const price = parseAmount(item.pricePerUnit);
        const total = qty * price;
        subtotal += total;
        return {
          ...item,
          quantity: qty.toString(),
          pricePerUnit: price.toString(),
          totalPrice: total.toString(),
        };
      });

      // Validate stock first
      for (const item of normalizedItems) {
        const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
        const currentStock = parseAmount(product?.currentStock || "0");
        const qty = parseAmount(item.quantity);
        if (currentStock < qty) {
          throw new Error(`Insufficient stock for product ${product?.name || item.productId}. Available: ${currentStock}, Required: ${qty}`);
        }
      }

      const loadingCharge = parseAmount(sale.loadingCharges || "0");
      const weighingCharge = parseAmount(sale.weighingCharges || "0");
      const otherCharge = parseAmount(sale.otherCharges || "0");
      const charges = loadingCharge + weighingCharge + otherCharge;
      const taxAmount = parseAmount((sale as any).taxAmount || 0);
      const totalAmount = subtotal + charges + taxAmount;

      const newSale = tx.insert(sales).values({
        ...sale,
        invoiceNumber,
        gatePassNumber,
        subtotal: subtotal.toString(),
        totalAmount: totalAmount.toString(),
        taxAmount: taxAmount.toString(),
        taxTypeId: (sale as any).taxTypeId ?? null,
      }).returning().get();

      for (const item of normalizedItems) {
        tx.insert(saleItems).values({
          ...item,
          saleId: newSale.id,
        }).run();
        this.updateProductStockInternal(client, item.productId, item.quantity, "subtract");
      }

      // Double-entry: split sale into base/tax/charge lines so ledgers show each impact.
      const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
      const revenueAccount = this.ensureSystemAccount(client, "Sales Revenue", "income");
      const saleBaseLabel = `SALE ${invoiceNumber}`;
      const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

      const baseRevenue = Math.max(subtotal, 0);
      if (baseRevenue > 0) {
        const amount = baseRevenue.toString();
        pushLine({
          accountId: sale.customerId,
          transactionType: "debit",
          amount,
          description: saleBaseLabel,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: revenueAccount.id,
          transactionType: "credit",
          amount,
          description: saleBaseLabel,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
      }

      const chargeLines = [
        { label: "LOADING", amount: loadingCharge },
        { label: "WEIGHING", amount: weighingCharge },
        { label: "OTHER", amount: otherCharge },
      ];
      for (const line of chargeLines) {
        if (line.amount === 0) continue;
        const entryType = line.amount > 0 ? "credit" : "debit";
        const amount = Math.abs(line.amount).toString();
        const chargeAccount = this.ensureSalesChargeAccount(client, line.label as "LOADING" | "WEIGHING" | "OTHER");
        pushLine({
          accountId: chargeAccount.id,
          transactionType: entryType,
          amount,
          description: line.label,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: sale.customerId,
          transactionType: entryType === "credit" ? "debit" : "credit",
          amount,
          description: line.label,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
      }

      if (taxAmount > 0) {
        const taxTypeId = (sale as any).taxTypeId as number | undefined;
        let taxAccountId: number;
        if (taxTypeId) {
          const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId)).all();
          const taxAcct = tt?.outputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.outputAccountId)).all()[0] : undefined;
          taxAccountId = taxAcct?.id ?? this.ensureSystemAccount(client, "Tax Output", "liability").id;
        } else {
          taxAccountId = this.ensureSystemAccount(client, "Tax Output", "liability").id;
        }
        const taxLabel = "TAX";
        pushLine({
          accountId: taxAccountId,
          transactionType: "credit",
          amount: taxAmount.toString(),
          description: taxLabel,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
        pushLine({
          accountId: sale.customerId,
          transactionType: "debit",
          amount: taxAmount.toString(),
          description: taxLabel,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
        tx.insert(taxLedgers).values({
          taxTypeId: taxTypeId ?? null,
          sourceType: "sale",
          sourceId: newSale.id,
          taxBase: subtotal.toString(),
          taxAmount: taxAmount.toString(),
          postingDate,
          createdAt: new Date(),
        } as any).run();
      }

      this.postBalancedLedgerEntries(client, ledgerLines, `sale ${invoiceNumber}`);

      // COGS: use current avgPurchasePrice * qty
      const inventoryAccount = this.ensureSystemAccount(client, "Inventory", "asset");
      const cogsAccount = this.ensureSystemAccount(client, "Cost of Goods Sold", "cogs");
      let totalCogs = 0;
      for (const item of normalizedItems) {
        const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
        const avgCost = parseAmount(product?.avgPurchasePrice || "0");
        const qty = parseAmount(item.quantity);
        const lineCost = avgCost * qty;
        totalCogs += lineCost;
      }
      if (totalCogs > 0) {
        this.postLedgerEntry(client, {
          accountId: cogsAccount.id,
          transactionType: "debit",
          amount: totalCogs.toString(),
          description: `COGS ${invoiceNumber}`,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
        this.postLedgerEntry(client, {
          accountId: inventoryAccount.id,
          transactionType: "credit",
          amount: totalCogs.toString(),
          description: `Inventory Relief ${invoiceNumber}`,
          referenceType: "sale",
          referenceId: newSale.id,
          entryDate: postingDate,
        });
      }

        return newSale;
      });
    }

    async updateSale(id: number, sale: Partial<InsertSale>, items: SaleItemInput[]): Promise<Sale | undefined> {
      const existing = await this.getSale(id);
      if (!existing) return undefined;
      const existingItems = await this.getSaleItems(id);

      return db.transaction((tx) => {
        const client = tx as unknown as DbClient;
        const postingDate = toValidDate(sale.saleDate ?? existing.saleDate);
        this.assertPostingAllowed(client, postingDate, "sale");

          // Remove previous ledger entries instead of posting reversals.
          const priorEntries = tx
            .select()
            .from(ledgerEntries)
            .where(and(eq(ledgerEntries.referenceType, "sale"), eq(ledgerEntries.referenceId, id)))
            .all();
          const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
          tx.delete(ledgerEntries)
            .where(and(eq(ledgerEntries.referenceType, "sale"), eq(ledgerEntries.referenceId, id)))
            .run();
          this.recomputeAccountBalances(client, affectedAccountIds);

        // Rollback previous stock impact
        for (const item of existingItems) {
          this.updateProductStockInternal(client, item.productId, item.quantity, "add");
        }

        let subtotal = 0;
        const normalizedItems = items.map((item) => {
          const qty = parseAmount(item.quantity);
          const price = parseAmount(item.pricePerUnit);
          const total = qty * price;
          subtotal += total;
          return {
            ...item,
            quantity: qty.toString(),
            pricePerUnit: price.toString(),
            totalPrice: total.toString(),
          };
        });

        // Validate stock after rollback
        for (const item of normalizedItems) {
          const [product] = tx.select().from(products).where(eq(products.id, item.productId)).all();
          const currentStock = parseAmount(product?.currentStock || "0");
          const qty = parseAmount(item.quantity);
          if (currentStock < qty) {
            throw new Error(`Insufficient stock for product ${product?.name || item.productId}. Available: ${currentStock}, Required: ${qty}`);
          }
        }

        const loadingCharge = parseAmount(sale.loadingCharges ?? existing.loadingCharges ?? "0");
        const weighingCharge = parseAmount(sale.weighingCharges ?? existing.weighingCharges ?? "0");
        const otherCharge = parseAmount(sale.otherCharges ?? existing.otherCharges ?? "0");
        const charges = loadingCharge + weighingCharge + otherCharge;
        const taxAmount = parseAmount((sale as any).taxAmount ?? existing.taxAmount ?? 0);
        const totalAmount = subtotal + charges + taxAmount;
        const paidAmount = parseAmount(sale.paidAmount ?? existing.paidAmount ?? 0);

        const updatedSale = tx.update(sales).set({
          ...sale,
          subtotal: subtotal.toString(),
          totalAmount: totalAmount.toString(),
          taxAmount: taxAmount.toString(),
          taxTypeId: (sale as any).taxTypeId ?? existing.taxTypeId ?? null,
          paidAmount: paidAmount.toString(),
        }).where(eq(sales.id, id)).returning().get();

        tx.delete(saleItems).where(eq(saleItems.saleId, id)).run();
        for (const item of normalizedItems) {
          tx.insert(saleItems).values({
            ...item,
            saleId: id,
          }).run();
          this.updateProductStockInternal(client, item.productId, item.quantity, "subtract");
        }

        tx.delete(taxLedgers).where(and(eq(taxLedgers.sourceType, "sale"), eq(taxLedgers.sourceId, id))).run();

        const customerId = sale.customerId ?? existing.customerId;
        const ledgerLines: Omit<InsertLedgerEntry, "balance">[] = [];
        const revenueAccount = this.ensureSystemAccount(client, "Sales Revenue", "income");
        const saleBaseLabel = `SALE ${existing.invoiceNumber}`;
        const pushLine = (line: Omit<InsertLedgerEntry, "balance">) => ledgerLines.push(line);

        const baseRevenue = Math.max(subtotal, 0);
        if (baseRevenue > 0) {
          const amount = baseRevenue.toString();
          pushLine({
            accountId: customerId,
            transactionType: "debit",
            amount,
            description: saleBaseLabel,
            referenceType: "sale",
            referenceId: id,
            entryDate: postingDate,
          });
          pushLine({
            accountId: revenueAccount.id,
            transactionType: "credit",
            amount,
            description: saleBaseLabel,
            referenceType: "sale",
            referenceId: id,
            entryDate: postingDate,
          });
        }

        const chargeLines = [
          { label: "LOADING", amount: loadingCharge },
          { label: "WEIGHING", amount: weighingCharge },
          { label: "OTHER", amount: otherCharge },
        ];
        for (const line of chargeLines) {
          if (line.amount === 0) continue;
          const entryType = line.amount > 0 ? "credit" : "debit";
          const amount = Math.abs(line.amount).toString();
          pushLine({
            accountId: this.ensureSalesChargeAccount(client, line.label as "LOADING" | "WEIGHING" | "OTHER").id,
            transactionType: entryType,
            amount,
            description: line.label,
            referenceType: "sale",
            referenceId: id,
            entryDate: postingDate,
          });
          pushLine({
            accountId: customerId,
            transactionType: entryType === "credit" ? "debit" : "credit",
            amount,
            description: line.label,
            referenceType: "sale",
            referenceId: id,
            entryDate: postingDate,
          });
        }

        if (taxAmount > 0) {
          const taxTypeId = (sale as any).taxTypeId ?? existing.taxTypeId;
          let taxAccountId: number;
          if (taxTypeId) {
            const [tt] = tx.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId as any)).all();
            const taxAcct = tt?.outputAccountId ? tx.select().from(accounts).where(eq(accounts.id, tt.outputAccountId)).all()[0] : undefined;
            taxAccountId = taxAcct?.id ?? this.ensureSystemAccount(client, "Tax Output", "liability").id;
          } else {
            taxAccountId = this.ensureSystemAccount(client, "Tax Output", "liability").id;
          }
          const taxLabel = "TAX";
          pushLine({
            accountId: taxAccountId,
            transactionType: "credit",
            amount: taxAmount.toString(),
            description: taxLabel,
            referenceType: "sale",
            referenceId: id,
            entryDate: postingDate,
          });
          pushLine({
            accountId: customerId,
            transactionType: "debit",
            amount: taxAmount.toString(),
            description: taxLabel,
            referenceType: "sale",
            referenceId: id,
            entryDate: postingDate,
          });
          tx.insert(taxLedgers).values({
            taxTypeId: taxTypeId ?? null,
            sourceType: "sale",
            sourceId: id,
            taxBase: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            postingDate,
            createdAt: new Date(),
          } as any).run();
        }

        this.postBalancedLedgerEntries(client, ledgerLines, `sale ${existing.invoiceNumber}`);

        return updatedSale;
      });
    }

    async deleteSale(id: number): Promise<boolean> {
      const existing = await this.getSale(id);
      if (!existing) return false;
      const paidAmount = parseAmount(existing.paidAmount || "0");
      if (paidAmount > 0) {
        throw new Error("Cannot delete a sale that has recorded payments");
      }
      const items = await this.getSaleItems(id);

        return db.transaction((tx) => {
          const client = tx as unknown as DbClient;
          const postingDate = toValidDate(existing.saleDate);
          this.assertPostingAllowed(client, postingDate, "sale");

          const priorEntries = tx
            .select()
            .from(ledgerEntries)
            .where(and(eq(ledgerEntries.referenceType, "sale"), eq(ledgerEntries.referenceId, id)))
            .all();
          const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));

          for (const item of items) {
            this.updateProductStockInternal(client, item.productId, item.quantity, "add");
          }

          tx.delete(ledgerEntries).where(and(eq(ledgerEntries.referenceType, "sale"), eq(ledgerEntries.referenceId, id))).run();
          this.recomputeAccountBalances(client, affectedAccountIds);
          tx.delete(taxLedgers).where(and(eq(taxLedgers.sourceType, "sale"), eq(taxLedgers.sourceId, id))).run();
          tx.delete(saleItems).where(eq(saleItems.saleId, id)).run();
        tx.delete(sales).where(eq(sales.id, id)).run();

        return true;
      });
    }

  // Sale Items
  async getSaleItems(saleId: number): Promise<SaleItem[]> {
    return db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  }

  // Ledger
  async getLedgerReport(params: {
    accountId: number;
    referenceType?: string;
    startDate?: Date;
    endDate?: Date;
    narration?: string;
  }): Promise<LedgerReport> {
    const { accountId, referenceType, startDate, endDate, narration } = params;
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const normalSide = normalSideForAccountType(account?.type);
    const resolveOpeningBalance = () => {
      let opening = parseAmount(account.openingBalance || "0");
      if (startDate) {
        const movementWhere = [eq(ledgerEntries.accountId, accountId), lt(ledgerEntries.entryDate, startDate)];
        if (referenceType) movementWhere.push(eq(ledgerEntries.referenceType, referenceType));
        const [movementRow] = db
          .select({
            total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = ${
              normalSide === "DEBIT" ? sql`'debit'` : sql`'credit'`
            } THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
          })
          .from(ledgerEntries)
          .where(and(...movementWhere as any))
          .all();
        opening += parseAmount(movementRow?.total || "0");
      }
      return opening;
    };
    const entriesBase = await this.getLedgerEntries(accountId, referenceType, startDate, endDate);
    const entries = (() => {
      const accountType = account?.type;
      const expandPurchase = accountType === "supplier";
      const expandSale = accountType === "customer";
      if (!expandPurchase && !expandSale) return entriesBase;

      const chargeLabel = (type: string) => {
        switch (type) {
          case "weight":
            return "WEIGHT ADD";
          case "freight":
            return "FREIGHT";
          case "loading_filling":
            return "LOADING/UNLOADING";
          case "market_fee":
            return "MARKET FEE";
          case "mitha_sukri":
            return "MITHA SUKRI";
          case "phone_analysis":
            return "PHONE/ANALYSIS";
          case "brokerage":
            return "BROKERAGE";
          case "commission":
            return "COMMISSION";
          case "bardana":
            return "BARDANA";
          case "broken_allowance":
            return "BROKEN ALLOWANCE";
          case "other":
          default:
            return "OTHER";
        }
      };

      const saleChargeLabels = [
        { key: "loading", label: "LOADING" },
        { key: "weighing", label: "WEIGHING" },
        { key: "other", label: "OTHER" },
      ];

      const detailLabels = new Set([
        "TAX",
        "BROKER COMMISSION",
        "LOADING",
        "WEIGHING",
        "OTHER",
        "WEIGHT ADD",
        "FREIGHT",
        "LOADING/UNLOADING",
        "MARKET FEE",
        "MITHA SUKRI",
        "PHONE/ANALYSIS",
        "BROKERAGE",
        "COMMISSION",
        "BARDANA",
        "BROKEN ALLOWANCE",
        "ACCOUNTANT / CLERK",
      ]);

      const byRef = new Map<string, typeof entriesBase>();
      for (const entry of entriesBase) {
        if (!entry.referenceType || !entry.referenceId) continue;
        const key = `${entry.referenceType}:${entry.referenceId}`;
        const list = byRef.get(key) || [];
        list.push(entry);
        byRef.set(key, list);
      }

      const purchaseIds = expandPurchase
        ? Array.from(new Set(entriesBase.filter((e) => e.referenceType === "purchase").map((e) => e.referenceId).filter(Boolean) as number[]))
        : [];
      const saleIds = expandSale
        ? Array.from(new Set(entriesBase.filter((e) => e.referenceType === "sale").map((e) => e.referenceId).filter(Boolean) as number[]))
        : [];

      const purchaseItemSubtotalById = new Map<number, string>(
        purchaseIds.length
          ? db
              .select({
                id: purchaseItems.purchaseId,
                subtotal: sql<string>`COALESCE(SUM(CAST(${purchaseItems.amount} AS REAL)), 0)`,
              })
              .from(purchaseItems)
              .where(and(inArray(purchaseItems.purchaseId, purchaseIds), isNull(purchaseItems.deletedAt)))
              .groupBy(purchaseItems.purchaseId)
              .all()
              .map((r) => [r.id, r.subtotal])
          : [],
      );
      const purchaseMetaById = new Map<
        number,
        { invoiceNumber?: string | null; purchaseDate?: Date | null; taxAmount?: string | null; brokerCommissionAmount?: string | null }
      >(
        purchaseIds.length
          ? db
              .select({
                id: purchases.id,
                invoiceNumber: purchases.invoiceNumber,
                purchaseDate: purchases.purchaseDate,
                taxAmount: purchases.taxAmount,
                brokerCommissionAmount: purchases.brokerCommissionAmount,
              })
              .from(purchases)
              .where(inArray(purchases.id, purchaseIds))
              .all()
              .map((r) => [r.id, r])
          : [],
      );
      const purchaseChargesById = new Map<number, PurchaseCharge[]>(
        purchaseIds.length
          ? db
              .select()
              .from(purchaseCharges)
              .where(inArray(purchaseCharges.purchaseId, purchaseIds))
              .all()
              .reduce((acc, row) => {
                const list = acc.get(row.purchaseId) || [];
                list.push(row);
                acc.set(row.purchaseId, list);
                return acc;
              }, new Map<number, PurchaseCharge[]>())
          : [],
      );

      const saleItemSubtotalById = new Map<number, string>(
        saleIds.length
          ? db
              .select({
                id: saleItems.saleId,
                subtotal: sql<string>`COALESCE(SUM(CAST(${saleItems.totalPrice} AS REAL)), 0)`,
              })
              .from(saleItems)
              .where(inArray(saleItems.saleId, saleIds))
              .groupBy(saleItems.saleId)
              .all()
              .map((r) => [r.id, r.subtotal])
          : [],
      );
      const saleMetaById = new Map<
        number,
        { invoiceNumber?: string | null; saleDate?: Date | null; taxAmount?: string | null; loadingCharges?: string | null; weighingCharges?: string | null; otherCharges?: string | null }
      >(
        saleIds.length
          ? db
              .select({
                id: sales.id,
                invoiceNumber: sales.invoiceNumber,
                saleDate: sales.saleDate,
                taxAmount: sales.taxAmount,
                loadingCharges: sales.loadingCharges,
                weighingCharges: sales.weighingCharges,
                otherCharges: sales.otherCharges,
              })
              .from(sales)
              .where(inArray(sales.id, saleIds))
              .all()
              .map((r) => [r.id, r])
          : [],
      );

      const shouldExpand = (refType: string, refId: number, list: typeof entriesBase) => {
        if ((refType === "purchase" && !expandPurchase) || (refType === "sale" && !expandSale)) return false;
        const hasDetail = list.some((e) => {
          const label = (e.description || "").trim().toUpperCase();
          return detailLabels.has(label) || label.includes("TAX");
        });
        if (hasDetail) return false;
        return true;
      };

      let virtualId = 0;
      const buildEntry = (args: {
        refType: string;
        refId: number;
        entryDate: Date | number;
        transactionType: "debit" | "credit";
        amount: number;
        description: string;
      }) => {
        const amount = Math.abs(args.amount);
        return {
          id: -1 * (++virtualId),
          accountId,
          entryDate: args.entryDate,
          transactionType: args.transactionType,
          amount: amount.toString(),
          description: args.description,
          referenceType: args.refType,
          referenceId: args.refId,
          debit: args.transactionType === "debit" ? amount.toString() : "0",
          credit: args.transactionType === "credit" ? amount.toString() : "0",
        } as LedgerEntry & { debit?: string; credit?: string };
      };

      const result: typeof entriesBase = [];
      const processed = new Set<string>();
      for (const entry of entriesBase) {
        if (!entry.referenceType || !entry.referenceId) {
          result.push(entry);
          continue;
        }
        const refType = entry.referenceType;
        const refId = entry.referenceId;
        const key = `${refType}:${refId}`;
        const list = byRef.get(key);
        if (!list || !shouldExpand(refType, refId, list)) {
          result.push(entry);
          continue;
        }
        if (processed.has(key)) {
          continue;
        }
        processed.add(key);
        if (refType === "purchase" && expandPurchase) {
          const meta = purchaseMetaById.get(refId);
          const entryDate = meta?.purchaseDate || entry.entryDate || new Date();
          const baseAmount = parseAmount(purchaseItemSubtotalById.get(refId) || "0");
          if (baseAmount > 0) {
            result.push(
              buildEntry({
                refType,
                refId,
                entryDate,
                transactionType: "credit",
                amount: baseAmount,
                description: `PURCHASE ${meta?.invoiceNumber || `PUR-${refId}`}`,
              }),
            );
          }
          const brokerCommission = parseAmount(meta?.brokerCommissionAmount || "0");
          if (brokerCommission > 0) {
            result.push(
              buildEntry({
                refType,
                refId,
                entryDate,
                transactionType: "credit",
                amount: brokerCommission,
                description: "BROKER COMMISSION",
              }),
            );
          }
          const charges = purchaseChargesById.get(refId) || [];
          for (const charge of charges) {
            const amt = parseAmount(charge.amount);
            if (amt <= 0) continue;
            const transactionType = charge.mode === "less" ? "debit" : "credit";
            result.push(
              buildEntry({
                refType,
                refId,
                entryDate,
                transactionType,
                amount: amt,
                description: chargeLabel(charge.type),
              }),
            );
          }
          const taxAmount = parseAmount(meta?.taxAmount || "0");
          if (taxAmount > 0) {
            result.push(
              buildEntry({
                refType,
                refId,
                entryDate,
                transactionType: "credit",
                amount: taxAmount,
                description: "TAX",
              }),
            );
          }
          continue;
        }
        if (refType === "sale" && expandSale) {
          const meta = saleMetaById.get(refId);
          const entryDate = meta?.saleDate || entry.entryDate || new Date();
          const baseAmount = parseAmount(saleItemSubtotalById.get(refId) || "0");
          if (baseAmount > 0) {
            result.push(
              buildEntry({
                refType,
                refId,
                entryDate,
                transactionType: "debit",
                amount: baseAmount,
                description: `SALE ${meta?.invoiceNumber || `SAL-${refId}`}`,
              }),
            );
          }
          const saleCharges = [
            { label: saleChargeLabels[0].label, amount: parseAmount(meta?.loadingCharges || "0") },
            { label: saleChargeLabels[1].label, amount: parseAmount(meta?.weighingCharges || "0") },
            { label: saleChargeLabels[2].label, amount: parseAmount(meta?.otherCharges || "0") },
          ];
          for (const charge of saleCharges) {
            if (charge.amount === 0) continue;
            const transactionType = charge.amount >= 0 ? "debit" : "credit";
            result.push(
              buildEntry({
                refType,
                refId,
                entryDate,
                transactionType,
                amount: Math.abs(charge.amount),
                description: charge.label,
              }),
            );
          }
          const taxAmount = parseAmount(meta?.taxAmount || "0");
          if (taxAmount > 0) {
            result.push(
              buildEntry({
                refType,
                refId,
                entryDate,
                transactionType: "debit",
                amount: taxAmount,
                description: "TAX",
              }),
            );
          }
          continue;
        }
        result.push(entry);
      }
      return result;
    })();
    const openingBalance = entriesBase[0]?.openingBalance
      ? parseAmount(entriesBase[0].openingBalance)
      : resolveOpeningBalance();

    const narrationFilterRaw = (narration || "").trim().toLowerCase();
    const narrationTokens = narrationFilterRaw
      ? narrationFilterRaw.split(/[,|\s]+/).map((t) => t.trim()).filter(Boolean)
      : [];
    const matchesNarration = (value: string) => {
      if (narrationTokens.length === 0) return true;
      const haystack = value.toLowerCase();
      return narrationTokens.some((token) => haystack.includes(token));
    };
    const filteredEntries = narrationTokens.length > 0
      ? entries.filter((e) => {
          const base = (e.description || "").toLowerCase();
          return matchesNarration(base);
        })
      : entries;

    const byType = filteredEntries.reduce(
      (acc, e) => {
        if (!e.referenceType || !e.referenceId) return acc;
        const list = acc[e.referenceType] || [];
        list.push(e.referenceId);
        acc[e.referenceType] = list;
        return acc;
      },
      {} as Record<string, number[]>,
    );

    const uniqueIds = (list?: number[]) => Array.from(new Set(list || []));
    const purchaseIds = uniqueIds(byType.purchase);
    const saleIds = uniqueIds(byType.sale);
    const receiptIds = uniqueIds([...(byType.receipt || []), ...(byType.payment || [])]);
    const journalIds = uniqueIds(byType.journal_voucher);
    const expenseIds = uniqueIds(byType.expense);

    const purchaseNoById = new Map<number, string>(
      purchaseIds.length
        ? db
            .select({ id: purchases.id, no: purchases.invoiceNumber })
            .from(purchases)
            .where(inArray(purchases.id, purchaseIds))
            .all()
            .map((r) => [r.id, r.no])
        : [],
    );
    const purchaseItemSubtotalById = new Map<number, string>(
      purchaseIds.length
        ? db
            .select({
              id: purchaseItems.purchaseId,
              subtotal: sql<string>`COALESCE(SUM(CAST(${purchaseItems.amount} AS REAL)), 0)`,
            })
            .from(purchaseItems)
            .where(and(inArray(purchaseItems.purchaseId, purchaseIds), isNull(purchaseItems.deletedAt)))
            .groupBy(purchaseItems.purchaseId)
            .all()
            .map((r) => [r.id, r.subtotal])
        : [],
    );
    const purchaseMetaById = new Map<
      number,
      {
        invoiceNumber?: string | null;
        totalNetWeightKg?: string | null;
        totalMoundQty?: string | null;
        subtotal?: string | null;
        itemsSubtotal?: string | null;
        totalAmount?: string | null;
      }
    >(
      purchaseIds.length
        ? db
            .select({
              id: purchases.id,
              invoiceNumber: purchases.invoiceNumber,
              totalNetWeightKg: purchases.totalNetWeightKg,
              totalMoundQty: purchases.totalMoundQty,
              subtotal: purchases.subtotal,
              totalAmount: purchases.totalAmount,
            })
            .from(purchases)
            .where(inArray(purchases.id, purchaseIds))
            .all()
            .map((r) => [r.id, { ...r, itemsSubtotal: purchaseItemSubtotalById.get(r.id) }])
        : [],
    );
    const purchaseItemRows = purchaseIds.length
      ? db
          .select({
            purchaseId: purchaseItems.purchaseId,
            productId: purchaseItems.productId,
            moundQty: purchaseItems.moundQty,
            netWeightKg: purchaseItems.netWeightKg,
            rate: purchaseItems.rate,
          })
          .from(purchaseItems)
          .where(and(inArray(purchaseItems.purchaseId, purchaseIds), isNull(purchaseItems.deletedAt)))
          .all()
      : [];
    const purchaseProductIds = Array.from(new Set(purchaseItemRows.map((item) => item.productId)));
    const purchaseProductRows = purchaseProductIds.length
      ? db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, purchaseProductIds)).all()
      : [];
    const purchaseProductNameById = new Map<number, string>(purchaseProductRows.map((p) => [p.id, p.name]));
    const summarizeNames = (names?: Iterable<string>) => {
      const list = Array.from(new Set(names ? Array.from(names) : [])).filter(Boolean);
      if (list.length === 0) return "";
      if (list.length === 1) return list[0];
      return `${list[0]} +${list.length - 1} more`;
    };
    const purchaseItemNameSets = new Map<number, Set<string>>();
    const purchaseItemTotalsById = new Map<number, { moundQty: number; netKg: number }>();
    const purchaseItemRatesById = new Map<number, Set<number>>();
    for (const item of purchaseItemRows) {
      const name = purchaseProductNameById.get(item.productId);
      if (!name) continue;
      const set = purchaseItemNameSets.get(item.purchaseId) || new Set<string>();
      set.add(name);
      purchaseItemNameSets.set(item.purchaseId, set);
      const moundQty = parseAmount(item.moundQty || "0");
      const netKg = parseAmount(item.netWeightKg || "0");
      const current = purchaseItemTotalsById.get(item.purchaseId) || { moundQty: 0, netKg: 0 };
      purchaseItemTotalsById.set(item.purchaseId, {
        moundQty: current.moundQty + moundQty,
        netKg: current.netKg + netKg,
      });
      const rateValue = parseAmount(item.rate || "0");
      if (rateValue > 0) {
        const rates = purchaseItemRatesById.get(item.purchaseId) || new Set<number>();
        rates.add(rateValue);
        purchaseItemRatesById.set(item.purchaseId, rates);
      }
    }
    const purchaseItemNameById = new Map<number, string>(
      Array.from(purchaseItemNameSets.entries()).map(([id, names]) => [id, summarizeNames(names)]),
    );
    const purchaseItemTotals = new Map<number, { moundQty: number; netKg: number }>(
      Array.from(purchaseItemTotalsById.entries()).map(([id, totals]) => [id, totals]),
    );
    const purchaseItemRates = new Map<number, number[]>(
      Array.from(purchaseItemRatesById.entries()).map(([id, rates]) => [id, Array.from(rates)]),
    );
    const saleNoById = new Map<number, string>(
      saleIds.length
        ? db
            .select({ id: sales.id, no: sales.invoiceNumber })
            .from(sales)
            .where(inArray(sales.id, saleIds))
            .all()
            .map((r) => [r.id, r.no])
        : [],
    );
    const saleMetaById = new Map<number, { invoiceNumber?: string | null; subtotal?: string | null; totalAmount?: string | null }>(
      saleIds.length
        ? db
            .select({ id: sales.id, invoiceNumber: sales.invoiceNumber, subtotal: sales.subtotal, totalAmount: sales.totalAmount })
            .from(sales)
            .where(inArray(sales.id, saleIds))
            .all()
            .map((r) => [r.id, r])
        : [],
    );
    const saleItemRows = saleIds.length
      ? db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds)).all()
      : [];
    const saleProductIds = Array.from(new Set(saleItemRows.map((item) => item.productId)));
    const saleProductRows = saleProductIds.length
      ? db
          .select({ id: products.id, unit: products.unit, name: products.name })
          .from(products)
          .where(inArray(products.id, saleProductIds))
          .all()
      : [];
    const saleProductUnitById = new Map<number, string>(saleProductRows.map((p) => [p.id, p.unit || "units"]));
    const saleProductNameById = new Map<number, string>(saleProductRows.map((p) => [p.id, p.name]));
    const saleQtyById = new Map<number, { totalQty: number; unit: string }>();
    const saleItemNameSets = new Map<number, Set<string>>();
    for (const item of saleItemRows) {
      const qty = parseAmount(item.quantity);
      const unit = saleProductUnitById.get(item.productId) || "units";
      const current = saleQtyById.get(item.saleId) || { totalQty: 0, unit };
      const resolvedUnit = current.unit === unit ? unit : "units";
      saleQtyById.set(item.saleId, { totalQty: current.totalQty + qty, unit: resolvedUnit });
      const name = saleProductNameById.get(item.productId);
      if (name) {
        const set = saleItemNameSets.get(item.saleId) || new Set<string>();
        set.add(name);
        saleItemNameSets.set(item.saleId, set);
      }
    }
    const saleItemNameById = new Map<number, string>(
      Array.from(saleItemNameSets.entries()).map(([id, names]) => [id, summarizeNames(names)]),
    );
    const receiptMetaById = new Map<number, { no: string; voucherType: string; settlementAccountId: number | null }>(
      receiptIds.length
        ? db
            .select({
              id: receiptVouchers.id,
              no: receiptVouchers.voucherNumber,
              voucherType: receiptVouchers.voucherType,
              settlementAccountId: receiptVouchers.settlementAccountId,
            })
            .from(receiptVouchers)
            .where(inArray(receiptVouchers.id, receiptIds))
            .all()
            .map((r) => [r.id, { no: r.no, voucherType: r.voucherType, settlementAccountId: r.settlementAccountId ?? null }])
        : [],
    );
    const journalNoById = new Map<number, string>(
      journalIds.length
        ? db
            .select({ id: journalVouchers.id, no: journalVouchers.voucherNo })
            .from(journalVouchers)
            .where(inArray(journalVouchers.id, journalIds))
            .all()
            .map((r) => [r.id, r.no])
        : [],
    );
    const journalNarrationById = new Map<number, string>(
      journalIds.length
        ? db
            .select({ id: journalVouchers.id, narration: journalVouchers.narration })
            .from(journalVouchers)
            .where(inArray(journalVouchers.id, journalIds))
            .all()
            .map((r) => [r.id, r.narration || ""])
        : [],
    );
    const expenseMetaById = new Map<number, { voucherNo?: string | null; description?: string | null; expenseAccountId?: number | null }>(
      expenseIds.length
        ? db
            .select({
              id: expenseEntries.id,
              voucherNo: expenseEntries.voucherNo,
              description: expenseEntries.description,
              expenseAccountId: expenseEntries.expenseAccountId,
            })
            .from(expenseEntries)
            .where(inArray(expenseEntries.id, expenseIds))
            .all()
            .map((r) => [r.id, r])
        : [],
    );

    const settlementAccountIds = Array.from(
      new Set(
        Array.from(receiptMetaById.values())
          .map((m) => m.settlementAccountId)
          .filter((id): id is number => Number.isFinite(id as number)),
      ),
    );
    const settlementTypeById = new Map<number, string>(
      settlementAccountIds.length
        ? db
            .select({ id: accounts.id, type: accounts.type })
            .from(accounts)
            .where(inArray(accounts.id, settlementAccountIds))
            .all()
            .map((r) => [r.id, r.type])
        : [],
    );
    const settlementNameById = new Map<number, string>(
      settlementAccountIds.length
        ? db
            .select({ id: accounts.id, name: accounts.name })
            .from(accounts)
            .where(inArray(accounts.id, settlementAccountIds))
            .all()
            .map((r) => [r.id, r.name])
        : [],
    );
    const expenseAccountIds = Array.from(
      new Set(
        Array.from(expenseMetaById.values())
          .map((m) => m.expenseAccountId)
          .filter((id): id is number => Number.isFinite(id as number)),
      ),
    );
    const expenseAccountNameById = new Map<number, string>(
      expenseAccountIds.length
        ? db
            .select({ id: accounts.id, name: accounts.name })
            .from(accounts)
            .where(inArray(accounts.id, expenseAccountIds))
            .all()
            .map((r) => [r.id, r.name])
        : [],
    );

    const resolveVoucher = (refType?: string | null, refId?: number | null) => {
      if (!refType || !refId) return { vchType: "-", vchNo: "-" };
      if (refType === "purchase") return { vchType: "Purchase", vchNo: purchaseNoById.get(refId) || `PUR-${refId}` };
      if (refType === "sale") return { vchType: "Sale", vchNo: saleNoById.get(refId) || `SAL-${refId}` };
      if (refType === "journal_voucher") return { vchType: "JV", vchNo: journalNoById.get(refId) || `JV-${refId}` };
      if (refType === "receipt" || refType === "payment") {
        const meta = receiptMetaById.get(refId);
        const settlementType = meta?.settlementAccountId ? settlementTypeById.get(meta.settlementAccountId) : undefined;
        const isBank = settlementType === "bank";
        const vchType = refType === "receipt" ? (isBank ? "BRV" : "CRV") : (isBank ? "BPV" : "CPV");
        return { vchType, vchNo: meta?.no || `${vchType}-${refId}` };
      }
      if (refType === "expense") return { vchType: "EXP", vchNo: `EXP-${refId}` };
      return { vchType: refType.toUpperCase(), vchNo: `${refType.toUpperCase()}-${refId}` };
    };

    const formatQty = (value: number) =>
      value.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const formatRate = (value: number) =>
      value.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const formatMoney = (value: number) =>
      value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const normalizedChargeLabels = new Map<string, string>([
      ["weight", "WEIGHT ADD"],
      ["freight", "FREIGHT"],
      ["loading_filling", "LOADING/UNLOADING"],
      ["market_fee", "MARKET FEE"],
      ["mitha_sukri", "MITHA SUKRI"],
      ["phone_analysis", "PHONE/ANALYSIS"],
      ["brokerage", "BROKERAGE"],
      ["commission", "COMMISSION"],
      ["bardana", "BARDANA"],
      ["broken_allowance", "BROKEN ALLOWANCE"],
      ["accountant_clerk", "ACCOUNTANT / CLERK"],
      ["broker_commission", "BROKER COMMISSION"],
      ["other", "OTHER"],
      ["loading", "LOADING"],
      ["weighing", "WEIGHING"],
    ]);
    const isKnownChargeLabel = (label: string) => {
      const key = label.trim().toUpperCase();
      return Array.from(normalizedChargeLabels.values()).includes(key);
    };
    const normalizeChargeLabel = (description: string) => {
      const trimmed = (description || "").trim();
      if (!trimmed) return "";
      const upper = trimmed.toUpperCase();
      if (isKnownChargeLabel(upper)) return upper;
      const match = trimmed.match(/\(([^,]+),/);
      if (match) {
        const normalized = normalizedChargeLabels.get(match[1].trim().toLowerCase());
        if (normalized) return normalized;
      }
      return trimmed;
    };

    const formatRateList = (rates: number[]) => {
      if (!rates.length) return "";
      const list = rates.slice().sort((a, b) => a - b).map((rate) => formatRate(rate));
      if (list.length <= 2) return list.join("/");
      return `${list.slice(0, 2).join("/")}/+${list.length - 2} more`;
    };
    const buildPurchaseNarration = (entry: LedgerEntry, refId?: number | null) => {
      const rawDescription = (entry.description || "").trim();
      const lowerDescription = rawDescription.toLowerCase();
      const meta = refId ? purchaseMetaById.get(refId) : undefined;
      const invoice = meta?.invoiceNumber || (refId ? purchaseNoById.get(refId) : "") || (refId ? `PUR-${refId}` : "");
      const base = invoice ? `PURCHASE ${invoice}` : "PURCHASE";
      const itemLabel = refId ? purchaseItemNameById.get(refId) : "";
      const itemTotals = refId ? purchaseItemTotals.get(refId) : undefined;
      const netKg = itemTotals?.netKg ?? parseAmount(meta?.totalNetWeightKg || "0");
      const moundQty = netKg > 0 ? netKg / 40 : (itemTotals?.moundQty ?? parseAmount(meta?.totalMoundQty || "0"));
      const subtotal = parseAmount(meta?.itemsSubtotal || meta?.subtotal || "0");
      const qtyParts = [];
      const parts = [base];
      const amountLabel = parseAmount(entry.amount || "0");
      if (itemLabel) parts.push(itemLabel);
      if (netKg > 0) qtyParts.push(`${formatQty(netKg)}KG`);
      if (moundQty > 0) qtyParts.push(`${formatQty(moundQty)} MUND`);
      if (qtyParts.length > 0) parts.push(...qtyParts);
      const itemRates = refId ? purchaseItemRates.get(refId) : undefined;
      const rateLabel = itemRates ? formatRateList(itemRates) : "";
      if (rateLabel) {
        parts.push(`RATE ${rateLabel} PER MUND`);
      }
      const joinParts = () => parts.join(" / ");
      if (lowerDescription.includes("reversal")) {
        return rawDescription;
      }
      if (lowerDescription.includes("tax")) {
        return amountLabel > 0 ? `TAX (${formatMoney(amountLabel)})` : "TAX";
      }
      if (lowerDescription.includes("charge") || isKnownChargeLabel(rawDescription)) {
        const label = normalizeChargeLabel(rawDescription);
        return amountLabel > 0 ? `${label} (${formatMoney(amountLabel)})` : label;
      }
      if (lowerDescription.includes("broker commission") || lowerDescription.includes("brokerage")) {
        return amountLabel > 0 ? `BROKER COMMISSION (${formatMoney(amountLabel)})` : "BROKER COMMISSION";
      }
      if (rawDescription && !lowerDescription.includes("purchase")) {
        return rawDescription;
      }
      return joinParts();
    };

    const buildSaleNarration = (entry: LedgerEntry, refId?: number | null) => {
      const rawDescription = (entry.description || "").trim();
      const lowerDescription = rawDescription.toLowerCase();
      const meta = refId ? saleMetaById.get(refId) : undefined;
      const invoice = meta?.invoiceNumber || (refId ? saleNoById.get(refId) : "") || (refId ? `SAL-${refId}` : "");
      const base = invoice ? `SALE ${invoice}` : "SALE";
      const itemLabel = refId ? saleItemNameById.get(refId) : "";
      const qtyMeta = refId ? saleQtyById.get(refId) : undefined;
      const subtotal = parseAmount(meta?.subtotal || "0");
      const parts = [base];
      const amountLabel = parseAmount(entry.amount || "0");
      if (itemLabel) parts.push(itemLabel);
      const qtyParts = [];
      if (qtyMeta && qtyMeta.totalQty > 0) {
        qtyParts.push(`${formatQty(qtyMeta.totalQty)} ${qtyMeta.unit || "units"}`.trim());
        if (subtotal > 0) {
          const rateBase = subtotal / Math.max(qtyMeta.totalQty, 1);
          parts.push(`RATE ${formatRate(rateBase)}`);
        }
      }
      if (qtyParts.length > 0) parts.push(...qtyParts);
      const joinParts = () => parts.join(" / ");
      if (lowerDescription.includes("reversal")) {
        return rawDescription;
      }
      if (lowerDescription.includes("tax")) {
        return amountLabel > 0 ? `TAX (${formatMoney(amountLabel)})` : "TAX";
      }
      if (lowerDescription.includes("charge") || isKnownChargeLabel(rawDescription)) {
        const label = normalizeChargeLabel(rawDescription);
        return amountLabel > 0 ? `${label} (${formatMoney(amountLabel)})` : label;
      }
      if (rawDescription && !lowerDescription.includes("sale")) {
        return rawDescription;
      }
      return joinParts();
    };

    const buildReceiptNarration = (refId?: number | null) => {
      if (!refId) return "RECEIPT";
      const meta = receiptMetaById.get(refId);
      const settlementId = meta?.settlementAccountId || undefined;
      const settlementType = settlementId ? settlementTypeById.get(settlementId) : undefined;
      const settlementName = settlementId ? settlementNameById.get(settlementId) : undefined;
      const modeLabel = settlementType === "bank"
        ? `Bank ${settlementName || "Bank"}`
        : "Cash";
      const vch = meta?.no || `CRV-${refId}`;
      return `RECEIPT ${vch} | ${modeLabel}`;
    };

    const buildPaymentNarration = (refId?: number | null) => {
      if (!refId) return "PAYMENT";
      const meta = receiptMetaById.get(refId);
      const settlementId = meta?.settlementAccountId || undefined;
      const settlementType = settlementId ? settlementTypeById.get(settlementId) : undefined;
      const settlementName = settlementId ? settlementNameById.get(settlementId) : undefined;
      const modeLabel = settlementType === "bank"
        ? `Bank ${settlementName || "Bank"}`
        : "Cash";
      const vch = meta?.no || `CPV-${refId}`;
      const cleanVch = vch.replace(/\(\s*RS\s*\)/gi, "").replace(/\s{2,}/g, " ").trim();
      return `PAYMENT ${cleanVch} | ${modeLabel}`;
    };

    const buildJournalNarration = (refId?: number | null) => {
      if (!refId) return "JV";
      const vch = journalNoById.get(refId) || `JV-${refId}`;
      const note = journalNarrationById.get(refId) || "";
      return note ? `${vch} | ${note}` : vch;
    };

    const buildExpenseNarration = (refId?: number | null) => {
      if (!refId) return "EXP";
      const meta = expenseMetaById.get(refId);
      const vch = meta?.voucherNo || `EXP-${refId}`;
      const accountName = meta?.expenseAccountId ? expenseAccountNameById.get(meta.expenseAccountId) : "";
      const desc = meta?.description || "";
      return [vch, accountName, desc].filter(Boolean).join(" | ");
    };

    let running = openingBalance;
    const rows: LedgerReportRow[] = [];
    for (const entry of filteredEntries) {
      const debit = parseAmount(entry.debit || "0");
      const credit = parseAmount(entry.credit || "0");
      const delta = normalSide === "DEBIT" ? debit - credit : credit - debit;
      running += delta;
      const voucher = resolveVoucher(entry.referenceType, entry.referenceId);

      let narration = entry.description || "";
      if (entry.referenceType === "purchase") {
        narration = buildPurchaseNarration(entry, entry.referenceId);
      } else if (entry.referenceType === "sale") {
        narration = buildSaleNarration(entry, entry.referenceId);
      } else if (entry.referenceType === "receipt") {
        narration = buildReceiptNarration(entry.referenceId);
      } else if (entry.referenceType === "payment") {
        narration = buildPaymentNarration(entry.referenceId);
      } else if (entry.referenceType === "journal_voucher") {
        narration = buildJournalNarration(entry.referenceId);
      } else if (entry.referenceType === "expense") {
        narration = buildExpenseNarration(entry.referenceId);
      }

      const matches = narrationTokens.length === 0
        || matchesNarration(narration || "")
        || matchesNarration(entry.description || "");
      if (!matches) continue;

      rows.push({
        id: entry.id,
        entryDate: entry.entryDate,
        narration,
        vchType: voucher.vchType,
        vchNo: voucher.vchNo,
        debit: debit.toString(),
        credit: credit.toString(),
        runningBalance: running.toString(),
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
      });
    }

    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += parseAmount(row.debit);
        acc.credit += parseAmount(row.credit);
        acc.closing = parseAmount(row.runningBalance || acc.closing);
        return acc;
      },
      { debit: 0, credit: 0, closing: openingBalance },
    );
    const closingFromTotals =
      normalSide === "DEBIT"
        ? openingBalance + totals.debit - totals.credit
        : openingBalance + totals.credit - totals.debit;

    return {
      account,
      openingBalance: openingBalance.toString(),
      rows,
      totals: {
        debit: totals.debit.toString(),
        credit: totals.credit.toString(),
        closingBalance: totals.closing.toString(),
      },
      validation: {
        closingMatchesLastRow:
          rows.length === 0 ? true : Math.abs(parseAmount(rows[rows.length - 1].runningBalance) - totals.closing) < 0.0001,
        closingMatchesTotals: Math.abs(closingFromTotals - totals.closing) < 0.0001,
      },
    };
  }

  async getLedgerEntries(
      accountId?: number,
      referenceType?: string,
      startDate?: Date,
      endDate?: Date,
    ): Promise<(LedgerEntry & { runningBalance?: string; debit?: string; credit?: string; openingBalance?: string })[]> {
    const whereClauses = [];
    if (accountId) whereClauses.push(eq(ledgerEntries.accountId, accountId));
    if (referenceType) whereClauses.push(eq(ledgerEntries.referenceType, referenceType));
    if (startDate) whereClauses.push(gte(ledgerEntries.entryDate, startDate));
    if (endDate) whereClauses.push(lte(ledgerEntries.entryDate, endOfDay(endDate)));

      const rowsBase = whereClauses.length
        ? db.select().from(ledgerEntries).where(and(...whereClauses as any)).orderBy(ledgerEntries.entryDate, ledgerEntries.id).all()
        : db.select().from(ledgerEntries).orderBy(ledgerEntries.entryDate, ledgerEntries.id).all();

    if (!accountId) {
      return rowsBase;
    }

    const [account] = db.select().from(accounts).where(eq(accounts.id, accountId)).all();
    const normalSide = normalSideForAccountType(account?.type);

    let opening = parseAmount(account?.openingBalance || "0");
    if (startDate) {
      const movementWhere = [eq(ledgerEntries.accountId, accountId), lt(ledgerEntries.entryDate, startDate)];
      if (referenceType) movementWhere.push(eq(ledgerEntries.referenceType, referenceType));

      const [movementRow] = db
        .select({
          total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = ${normalSide === "DEBIT" ? sql`'debit'` : sql`'credit'`} THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
        })
        .from(ledgerEntries)
        .where(and(...movementWhere as any))
        .all();
      opening += parseAmount(movementRow?.total || "0");
    }
      const rows = rowsBase;
      let running = opening;
      return rows.map((row) => {
        const debit = row.transactionType === "debit" ? parseAmount(row.amount) : 0;
        const credit = row.transactionType === "credit" ? parseAmount(row.amount) : 0;
        const delta = normalSide === "DEBIT" ? debit - credit : credit - debit;
        running += delta;
        return {
          ...row,
          openingBalance: opening.toString(),
          debit: debit.toString(),
          credit: credit.toString(),
          runningBalance: running.toString(),
          balance: running.toString(),
        };
      });
    }

  private createLedgerEntryInternal(client: DbClient, entry: InsertLedgerEntry): Promise<LedgerEntry> {
    return Promise.resolve(this.postLedgerEntry(client, entry));
  }

  async createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry> {
    return this.createLedgerEntryInternal(db, entry);
  }

  async getOrCreateCashAccount(): Promise<Account> {
    return this.ensureCashAccountInternal(db);
  }

  async recordCashTransaction(tx: CashTxInput): Promise<CashTransaction> {
    await this.ensureCashAccountInternal(db);
    const created = db.insert(cashTransactions).values(tx).returning().get();
    return created as any;
  }

  async getCashSummary(): Promise<{ opening: number; debit: number; credit: number; closing: number }> {
    const cash = await this.ensureCashAccountInternal(db);
    const rows = db.select().from(cashTransactions).where(eq(cashTransactions.accountId, cash.id)).orderBy(cashTransactions.transactionDate).all();
    let debit = 0;
    let credit = 0;
    for (const r of rows) {
      const amt = parseAmount(r.amount);
      if (r.transactionType === "DEBIT") debit += amt;
      else credit += amt;
    }
    const opening = parseAmount(cash.openingBalance || "0");
    const closing = opening + debit - credit;
    return { opening, debit, credit, closing };
  }

  async getCashTransactions(): Promise<CashTransaction[]> {
    const cash = await this.ensureCashAccountInternal(db);
    return db.select().from(cashTransactions).where(eq(cashTransactions.accountId, cash.id)).orderBy(desc(cashTransactions.transactionDate)).all();
  }

  // Cash Receipt Vouchers
  async getReceiptVouchers(): Promise<(ReceiptVoucher & { lines?: ReceiptVoucherLine[]; primaryAccountName?: string })[]> {
    const vouchers = db.select().from(receiptVouchers).where(isNull(receiptVouchers.deletedAt)).orderBy(desc(receiptVouchers.id)).all();
    const lines = db.select().from(receiptVoucherLines).all();
    const accountsList = await this.getAccounts();
    const accountMap = new Map(accountsList.map((a) => [a.id, a.name]));

    const linesByVoucher = lines.reduce<Record<number, ReceiptVoucherLine[]>>((acc, line) => {
      acc[line.voucherId] = acc[line.voucherId] || [];
      acc[line.voucherId].push(line);
      return acc;
    }, {});

    return vouchers.map((v) => {
      const voucherLines = linesByVoucher[v.id] || [];
      const primaryAccountName = voucherLines.length ? accountMap.get(voucherLines[0].accountId) || "" : "";
      return { ...v, lines: voucherLines, primaryAccountName };
    });
  }

  async getReceiptVoucher(id: number): Promise<(ReceiptVoucher & { lines: ReceiptVoucherLine[] }) | undefined> {
    const [voucher] = db.select().from(receiptVouchers).where(and(eq(receiptVouchers.id, id), isNull(receiptVouchers.deletedAt))).all();
    if (!voucher) return undefined;
    const lines = db.select().from(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).all();
    return { ...voucher, lines };
  }

  async getNextReceiptVoucherNumber(voucherType = "CR"): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(receiptVouchers)
      .where(eq(receiptVouchers.voucherType, voucherType))
      .orderBy(desc(receiptVouchers.id))
      .limit(1)
      .all();
    const nextNum = last ? parseInt(last.voucherNumber.split("-").pop() || "0") + 1 : 1;
    return `${voucherType}-${year}-${String(nextNum).padStart(5, "0")}`;
  }

  private validateBalanced(lines: ReceiptLineInput[]) {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseAmount(line.debit || "0");
      totalCredit += parseAmount(line.credit || "0");
    }
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error("Debit and Credit must be equal");
    }
    return { totalDebit, totalCredit };
  }

  async createReceiptVoucher(data: InsertReceiptVoucher, lines: ReceiptLineInput[]): Promise<ReceiptVoucher> {
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = data.voucherDate ? new Date(data.voucherDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "receipt/payment voucher");

        const voucherType = normalizeReceiptVoucherType(data.voucherType);
        const settlementAccount =
          data.settlementAccountId ||
          (voucherType === "CR" ? this.ensureCashAccountInternal(client).id : this.ensureSystemAccount(client, "Cash in Hand", "asset").id);

        const cleanLines = (lines || []).map((line) => {
          const amt = resolveReceiptLineAmount(line).toString();
          return {
            ...line,
            debit: voucherType === "DR" ? amt : "0",
            credit: voucherType === "CR" ? amt : "0",
          };
        });

        const total = cleanLines.reduce((sum, l) => sum + resolveReceiptLineAmount(l), 0);
        if (total <= 0) throw new Error("Voucher amount must be greater than 0");

      // Append counter-entry for settlement account to enforce double-entry
      const settlementLine: ReceiptLineInput = voucherType === "CR"
        ? { accountId: settlementAccount, debit: total.toString(), credit: "0", narration: "Settlement (Cash/Bank)" }
        : { accountId: settlementAccount, debit: "0", credit: total.toString(), narration: "Settlement (Cash/Bank)" };

      const normalizedLines = [...cleanLines, settlementLine];
      const { totalDebit, totalCredit } = this.validateBalanced(normalizedLines);
      const amountInWords = `${toWords(Math.round(totalDebit || totalCredit))} only`;

      const year = new Date().getFullYear();
      const [last] = tx.select().from(receiptVouchers)
        .where(eq(receiptVouchers.voucherType, data.voucherType || "CR"))
        .orderBy(desc(receiptVouchers.id))
        .limit(1)
        .all();
      const nextNum = last ? parseInt(last.voucherNumber.split("-").pop() || "0") + 1 : 1;
      const generatedNumber = `${data.voucherType || "CR"}-${year}-${String(nextNum).padStart(5, "0")}`;
      const voucherNumber = (data.voucherNumber && data.voucherNumber.trim() !== "")
        ? data.voucherNumber
        : generatedNumber;

      const voucher = tx.insert(receiptVouchers).values({
        ...data,
        settlementAccountId: settlementAccount,
        voucherNumber,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        amountInWords,
        updatedAt: new Date(),
      }).returning().get();

      for (const line of normalizedLines) {
        const debit = parseAmount(line.debit || "0");
        const credit = parseAmount(line.credit || "0");
        if (debit <= 0 && credit <= 0) continue;
        tx.insert(receiptVoucherLines).values({
          ...line,
          voucherId: voucher.id,
          debit: debit.toString(),
          credit: credit.toString(),
        }).run();

        if (debit > 0) {
          this.postLedgerEntry(client, {
            accountId: line.accountId,
            transactionType: "debit",
            amount: debit.toString(),
            description: `Receipt ${voucher.voucherNumber}`,
            referenceType: voucherType === "CR" ? "receipt" : "payment",
            referenceId: voucher.id,
            entryDate: postingDate,
          });
        }
        if (credit > 0) {
          this.postLedgerEntry(client, {
            accountId: line.accountId,
            transactionType: "credit",
            amount: credit.toString(),
            description: `Receipt ${voucher.voucherNumber}`,
            referenceType: voucherType === "CR" ? "receipt" : "payment",
            referenceId: voucher.id,
            entryDate: postingDate,
          });
        }
      }

      return voucher;
    });
  }

  async updateReceiptVoucher(id: number, data: Partial<InsertReceiptVoucher>, lines: ReceiptLineInput[]): Promise<ReceiptVoucher | undefined> {
    const existing = await this.getReceiptVoucher(id);
    if (!existing) return undefined;
    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = data.voucherDate ? new Date(data.voucherDate as any) : existing.voucherDate ? new Date(existing.voucherDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "receipt/payment voucher");

      // Reverse previous ledger impacts by recalculating balances from remaining entries (simpler approach: adjust via new postings only)
      tx.delete(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).run();
      tx.delete(ledgerEntries).where(and(eq(ledgerEntries.referenceType, existing.voucherType === "CR" ? "receipt" : "payment"), eq(ledgerEntries.referenceId, id))).run();

        const voucherType = normalizeReceiptVoucherType(data.voucherType || existing.voucherType || "CR");
        const settlementAccount =
          data.settlementAccountId ||
          existing.settlementAccountId ||
          (voucherType === "CR" ? this.ensureCashAccountInternal(client).id : this.ensureSystemAccount(client, "Cash in Hand", "asset").id);

        const cleanLines = (lines || []).map((line) => {
          const amt = resolveReceiptLineAmount(line).toString();
          return {
            ...line,
            debit: voucherType === "DR" ? amt : "0",
            credit: voucherType === "CR" ? amt : "0",
          };
        });

        const total = cleanLines.reduce((sum, l) => sum + resolveReceiptLineAmount(l), 0);
        if (total <= 0) throw new Error("Voucher amount must be greater than 0");

      const settlementLine: ReceiptLineInput = voucherType === "CR"
        ? { accountId: settlementAccount, debit: total.toString(), credit: "0", narration: "Settlement (Cash/Bank)" }
        : { accountId: settlementAccount, debit: "0", credit: total.toString(), narration: "Settlement (Cash/Bank)" };

      const normalizedLines = [...cleanLines, settlementLine];
      const { totalDebit, totalCredit } = this.validateBalanced(normalizedLines);
      const amountInWords = `${toWords(Math.round(totalDebit || totalCredit))} only`;

      const updated = tx.update(receiptVouchers).set({
        ...data,
        settlementAccountId: settlementAccount,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        amountInWords,
        updatedAt: new Date(),
      }).where(eq(receiptVouchers.id, id)).returning().get();

      for (const line of normalizedLines) {
        const debit = parseAmount(line.debit || "0");
        const credit = parseAmount(line.credit || "0");
        if (debit <= 0 && credit <= 0) continue;
        tx.insert(receiptVoucherLines).values({
          ...line,
          voucherId: id,
          debit: debit.toString(),
          credit: credit.toString(),
        }).run();

        if (debit > 0) {
          this.postLedgerEntry(client, {
            accountId: line.accountId,
            transactionType: "debit",
            amount: debit.toString(),
            description: `Receipt ${updated.voucherNumber}`,
            referenceType: voucherType === "CR" ? "receipt" : "payment",
            referenceId: id,
            entryDate: postingDate,
          });
        }
        if (credit > 0) {
          this.postLedgerEntry(client, {
            accountId: line.accountId,
            transactionType: "credit",
            amount: credit.toString(),
            description: `Receipt ${updated.voucherNumber}`,
            referenceType: voucherType === "CR" ? "receipt" : "payment",
            referenceId: id,
            entryDate: postingDate,
          });
        }
      }

      return updated;
    });
  }

  async deleteReceiptVoucher(id: number): Promise<boolean> {
    const existing = await this.getReceiptVoucher(id);
    if (!existing) return false;
      return db.transaction((tx) => {
        const client = tx as unknown as DbClient;
        const refType = existing.voucherType === "CR" ? "receipt" : "payment";
        const priorEntries = tx
          .select()
          .from(ledgerEntries)
          .where(and(eq(ledgerEntries.referenceType, refType), eq(ledgerEntries.referenceId, id)))
          .all();
        const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
        tx.delete(ledgerEntries)
          .where(and(eq(ledgerEntries.referenceType, refType), eq(ledgerEntries.referenceId, id)))
          .run();
        this.recomputeAccountBalances(client, affectedAccountIds);
        tx.update(receiptVouchers).set({ deletedAt: new Date() }).where(eq(receiptVouchers.id, id)).run();
        tx.delete(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).run();
        return true;
      });
  }

  // Journal Vouchers
  async getJournalVouchers(): Promise<(JournalVoucher & { entries: JournalVoucherEntry[] })[]> {
    const vouchers = db.select().from(journalVouchers).orderBy(desc(journalVouchers.id)).all();
    const entries = db.select().from(journalVoucherEntries).all();
    const grouped = new Map<number, JournalVoucherEntry[]>();
    for (const entry of entries) {
      const list = grouped.get(entry.journalVoucherId) || [];
      list.push(entry);
      grouped.set(entry.journalVoucherId, list);
    }
    return vouchers.map((v) => ({
      ...v,
      entries: grouped.get(v.id) || [],
    }));
  }

  async getJournalVoucher(id: number): Promise<(JournalVoucher & { entries: JournalVoucherEntry[] }) | undefined> {
    const [voucher] = db.select().from(journalVouchers).where(eq(journalVouchers.id, id)).all();
    if (!voucher) return undefined;
    const entries = db.select().from(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, id)).all();
    return { ...voucher, entries };
  }

  async getNextJournalVoucherNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = db.select().from(journalVouchers).orderBy(desc(journalVouchers.id)).limit(1).all();
    const nextNum = last ? parseInt(last.voucherNo.split("-").pop() || "0") + 1 : 1;
    return `JV-${year}-${String(nextNum).padStart(5, "0")}`;
  }

  private normalizeJournalEntries(entries: JournalEntryInput[]): { normalized: JournalEntryInput[]; total: number } {
    if (!entries || entries.length === 0) throw new Error("Journal entries are required");
    const normalized = entries.map((e) => ({
      ...e,
      entryType: (e.entryType || "DEBIT").toUpperCase() as "DEBIT" | "CREDIT",
      amount: parseAmount(e.amount || "0").toString(),
    })).filter((e) => parseAmount(e.amount) > 0);

    const debitLines = normalized.filter((e) => e.entryType === "DEBIT");
    const creditLines = normalized.filter((e) => e.entryType === "CREDIT");

    if (debitLines.length !== 1 || creditLines.length !== 1) {
      throw new Error("Exactly one Debit and one Credit account are required");
    }

    const debitTotal = parseAmount(debitLines[0].amount);
    const creditTotal = parseAmount(creditLines[0].amount);

    if (debitTotal <= 0 || creditTotal <= 0) {
      throw new Error("Amounts must be greater than 0");
    }
    if (Math.abs(debitTotal - creditTotal) > 0.0001) {
      throw new Error("Debit and Credit must be equal");
    }

    return { normalized, total: debitTotal };
  }

  private ensureAccountsExist(entries: JournalEntryInput[]) {
    for (const entry of entries) {
      const [account] = db.select().from(accounts).where(eq(accounts.id, entry.accountId)).all();
      if (!account) {
        throw new Error(`Invalid account selected (${entry.accountId})`);
      }
    }
  }

  private postJournalToLedger(client: DbClient, voucher: JournalVoucher, entries: JournalEntryInput[]) {
    for (const entry of entries) {
      const amount = parseAmount(entry.amount || "0").toString();
      this.postLedgerEntry(client, {
        accountId: entry.accountId,
        transactionType: entry.entryType === "DEBIT" ? "debit" : "credit",
        amount,
        description: `Journal Voucher ${voucher.voucherNo}`,
        referenceType: "journal_voucher",
        referenceId: voucher.id,
        entryDate: voucher.voucherDate ? new Date(voucher.voucherDate as any) : new Date(),
      });
    }
  }

  async createJournalVoucher(data: InsertJournalVoucher, entries: JournalEntryInput[]): Promise<JournalVoucher> {
    this.ensureAccountsExist(entries);
    const { normalized, total } = this.normalizeJournalEntries(entries);

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const postingDate = data.voucherDate ? new Date(data.voucherDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "journal voucher");

      const [last] = tx.select().from(journalVouchers).orderBy(desc(journalVouchers.id)).limit(1).all();
      const year = new Date().getFullYear();
      const nextNum = last ? parseInt(last.voucherNo.split("-").pop() || "0") + 1 : 1;
      const generatedNo = `JV-${year}-${String(nextNum).padStart(5, "0")}`;
      const voucherNo = (data as any).voucherNo && (data as any).voucherNo !== "" ? (data as any).voucherNo : generatedNo;

      const amountInWords = `${toWords(Math.round(total))} only`;
      const status = (data.status || "draft") as "draft" | "approved";

      const voucher = tx.insert(journalVouchers).values({
        ...data,
        voucherNo,
        voucherDate: postingDate,
        totalAmount: total.toString(),
        amountInWords,
        status,
        updatedAt: new Date(),
      }).returning().get();

      for (const entry of normalized) {
        tx.insert(journalVoucherEntries).values({
          ...entry,
          journalVoucherId: voucher.id,
          amount: parseAmount(entry.amount).toString(),
        }).run();
      }

      if (status === "approved") {
        this.postJournalToLedger(client, voucher, normalized);
      }

      return voucher;
    });
  }

  async updateJournalVoucher(id: number, data: Partial<InsertJournalVoucher>, entries: JournalEntryInput[]): Promise<JournalVoucher | undefined> {
    const existing = await this.getJournalVoucher(id);
    if (!existing) return undefined;
    if (existing.status === "approved") {
      throw new Error("Approved vouchers cannot be edited");
    }

    this.ensureAccountsExist(entries);
    const { normalized, total } = this.normalizeJournalEntries(entries);

    return db.transaction((tx) => {
      const amountInWords = `${toWords(Math.round(total))} only`;

      tx.delete(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, id)).run();

      for (const entry of normalized) {
        tx.insert(journalVoucherEntries).values({
          ...entry,
          journalVoucherId: id,
          amount: parseAmount(entry.amount).toString(),
        }).run();
      }

      const [updated] = tx.update(journalVouchers).set({
        voucherDate: data.voucherDate ?? existing.voucherDate,
        narration: data.narration ?? existing.narration,
        createdBy: data.createdBy ?? existing.createdBy,
        status: existing.status,
        totalAmount: total.toString(),
        amountInWords,
        updatedAt: new Date(),
      }).where(eq(journalVouchers.id, id)).returning().all();

      return updated;
    });
  }

  async approveJournalVoucher(id: number, approverId?: number): Promise<JournalVoucher | undefined> {
    const existing = await this.getJournalVoucher(id);
    if (!existing) return undefined;
    if (existing.status === "approved") return existing;

    return db.transaction((tx) => {
      const client = tx as unknown as DbClient;
      const entries = tx.select().from(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, id)).all();
      this.ensureAccountsExist(entries);
      const { total } = this.normalizeJournalEntries(entries);
      const amountInWords = `${toWords(Math.round(total))} only`;
      const postingDate = existing.voucherDate ? new Date(existing.voucherDate as any) : new Date();
      this.assertPostingAllowed(client, postingDate, "journal voucher approval");

      const [updated] = tx.update(journalVouchers).set({
        status: "approved",
        approvedBy: approverId ?? existing.approvedBy,
        amountInWords,
        totalAmount: total.toString(),
        updatedAt: new Date(),
      }).where(eq(journalVouchers.id, id)).returning().all();

      this.postJournalToLedger(client, { ...existing, ...updated }, entries);

      return updated;
    });
  }

  async deleteJournalVoucher(id: number): Promise<boolean> {
    const existing = await this.getJournalVoucher(id);
    if (!existing) return false;
    if (existing.status === "approved") {
      throw new Error("Approved vouchers cannot be deleted");
    }
    return db.transaction((tx) => {
      tx.delete(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, id)).run();
      tx.delete(journalVouchers).where(eq(journalVouchers.id, id)).run();
      return true;
    });
  }

  // Reports
  async getStockReport(filters?: {
    fromDate?: Date;
    toDate?: Date;
    productId?: number;
    category?: string;
    unit?: string;
  }) {
    const from = filters?.fromDate;
    const to = filters?.toDate ? endOfDay(filters.toDate) : undefined;

    const productWhere = [];
    if (filters?.productId) productWhere.push(eq(products.id, filters.productId));
    if (filters?.category) productWhere.push(eq(products.productType, filters.category as any));
    if (filters?.unit) productWhere.push(eq(products.unit, filters.unit));

    const productRows = productWhere.length
      ? db.select().from(products).where(and(...productWhere)).all()
      : db.select().from(products).all();

    const purchaseBase = [isNull(purchaseItems.deletedAt), isNull(purchases.deletedAt)];
    const purchaseBefore = from
      ? db
          .select({
            productId: purchaseItems.productId,
            qty: sql<string>`COALESCE(SUM(CAST(${purchaseItems.netWeightKg} AS REAL)), 0)`,
            value: sql<string>`COALESCE(SUM(CAST(${purchaseItems.amount} AS REAL)), 0)`,
          })
          .from(purchaseItems)
          .leftJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
          .where(and(...purchaseBase, lt(purchases.purchaseDate, from)))
          .groupBy(purchaseItems.productId)
          .all()
      : [];
    const purchaseIn = db
      .select({
        productId: purchaseItems.productId,
        qty: sql<string>`COALESCE(SUM(CAST(${purchaseItems.netWeightKg} AS REAL)), 0)`,
        value: sql<string>`COALESCE(SUM(CAST(${purchaseItems.amount} AS REAL)), 0)`,
      })
      .from(purchaseItems)
      .leftJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
      .where(
        and(
          ...purchaseBase,
          ...(from ? [gte(purchases.purchaseDate, from)] : []),
          ...(to ? [lte(purchases.purchaseDate, to)] : []),
        ),
      )
      .groupBy(purchaseItems.productId)
      .all();

    const salesBefore = from
      ? db
          .select({
            productId: saleItems.productId,
            qty: sql<string>`COALESCE(SUM(CAST(${saleItems.quantity} AS REAL)), 0)`,
          })
          .from(saleItems)
          .leftJoin(sales, eq(saleItems.saleId, sales.id))
          .where(lt(sales.saleDate, from))
          .groupBy(saleItems.productId)
          .all()
      : [];
    const salesIn = db
      .select({
        productId: saleItems.productId,
        qty: sql<string>`COALESCE(SUM(CAST(${saleItems.quantity} AS REAL)), 0)`,
      })
      .from(saleItems)
      .leftJoin(sales, eq(saleItems.saleId, sales.id))
      .where(
        and(
          ...(from ? [gte(sales.saleDate, from)] : []),
          ...(to ? [lte(sales.saleDate, to)] : []),
        ),
      )
      .groupBy(saleItems.productId)
      .all();

    const processingOutBefore = from
      ? db
          .select({
            productId: processing.sourceProductId,
            qty: sql<string>`COALESCE(SUM(CAST(${processing.sourceQuantity} AS REAL)), 0)`,
          })
          .from(processing)
          .where(lt(processing.startDate, from))
          .groupBy(processing.sourceProductId)
          .all()
      : [];
    const processingOutIn = db
      .select({
        productId: processing.sourceProductId,
        qty: sql<string>`COALESCE(SUM(CAST(${processing.sourceQuantity} AS REAL)), 0)`,
      })
      .from(processing)
      .where(
        and(
          ...(from ? [gte(processing.startDate, from)] : []),
          ...(to ? [lte(processing.startDate, to)] : []),
        ),
      )
      .groupBy(processing.sourceProductId)
      .all();

    const processingInBefore = from
      ? db
          .select({
            productId: processing.outputProductId,
            qty: sql<string>`COALESCE(SUM(CAST(${processing.outputQuantity} AS REAL)), 0)`,
          })
          .from(processing)
          .where(
            and(
              sql`${processing.completedDate} IS NOT NULL`,
              lt(processing.completedDate, from),
            ),
          )
          .groupBy(processing.outputProductId)
          .all()
      : [];
    const processingIn = db
      .select({
        productId: processing.outputProductId,
        qty: sql<string>`COALESCE(SUM(CAST(${processing.outputQuantity} AS REAL)), 0)`,
      })
      .from(processing)
      .where(
        and(
          sql`${processing.completedDate} IS NOT NULL`,
          ...(from ? [gte(processing.completedDate, from)] : []),
          ...(to ? [lte(processing.completedDate, to)] : []),
        ),
      )
      .groupBy(processing.outputProductId)
      .all();

    const toQtyMap = (rows: Array<{ productId: number | null; qty: string }>) =>
      new Map(rows.filter((r) => r.productId != null).map((r) => [r.productId as number, parseAmount(r.qty)]));
    const toValueMap = (rows: Array<{ productId: number | null; value: string }>) =>
      new Map(rows.filter((r) => r.productId != null).map((r) => [r.productId as number, parseAmount(r.value)]));

    const purchaseBeforeQty = toQtyMap(purchaseBefore as any);
    const purchaseBeforeValue = toValueMap(purchaseBefore as any);
    const purchaseInQty = toQtyMap(purchaseIn as any);
    const purchaseInValue = toValueMap(purchaseIn as any);
    const salesBeforeQty = toQtyMap(salesBefore as any);
    const salesInQty = toQtyMap(salesIn as any);
    const procOutBeforeQty = toQtyMap(processingOutBefore as any);
    const procOutInQty = toQtyMap(processingOutIn as any);
    const procInBeforeQty = toQtyMap(processingInBefore as any);
    const procInQty = toQtyMap(processingIn as any);

    const rows = productRows.map((p) => {
      const avgCost = parseAmount(p.avgPurchasePrice || "0");
      const openingInQty = (purchaseBeforeQty.get(p.id) || 0) + (procInBeforeQty.get(p.id) || 0);
      const openingOutQty = (salesBeforeQty.get(p.id) || 0) + (procOutBeforeQty.get(p.id) || 0);
      const openingQty = openingInQty - openingOutQty;
      const openingValue =
        (purchaseBeforeValue.get(p.id) || 0) +
        (procInBeforeQty.get(p.id) || 0) * avgCost -
        ((salesBeforeQty.get(p.id) || 0) + (procOutBeforeQty.get(p.id) || 0)) * avgCost;

      const inQty = (purchaseInQty.get(p.id) || 0) + (procInQty.get(p.id) || 0);
      const inValue =
        (purchaseInValue.get(p.id) || 0) + (procInQty.get(p.id) || 0) * avgCost;
      const outQty = (salesInQty.get(p.id) || 0) + (procOutInQty.get(p.id) || 0);
      const outValue = outQty * avgCost;

      const roll = computeInventoryRollForward({
        openingQty,
        openingValue,
        inQty,
        inValue,
        outQty,
        outValue,
      });

      return {
        productId: p.id,
        itemCode: String(p.id),
        itemName: p.name,
        category: p.productType || "",
        unit: p.unit,
        openingQty: openingQty.toString(),
        openingValue: openingValue.toString(),
        inQty: inQty.toString(),
        inValue: inValue.toString(),
        outQty: outQty.toString(),
        outValue: outValue.toString(),
        closingQty: roll.closingQty.toString(),
        closingValue: roll.closingValue.toString(),
        avgCost: roll.avgCost.toString(),
        currentStock: p.currentStock,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.openingQty += parseAmount(r.openingQty);
        acc.inQty += parseAmount(r.inQty);
        acc.outQty += parseAmount(r.outQty);
        acc.closingQty += parseAmount(r.closingQty);
        acc.closingValue += parseAmount(r.closingValue);
        return acc;
      },
      { openingQty: 0, inQty: 0, outQty: 0, closingQty: 0, closingValue: 0 },
    );

    const rollForwardDifference = totals.openingQty + totals.inQty - totals.outQty - totals.closingQty;

    return {
      rows,
      totals: {
        openingQty: totals.openingQty.toString(),
        inQty: totals.inQty.toString(),
        outQty: totals.outQty.toString(),
        closingQty: totals.closingQty.toString(),
        closingValue: totals.closingValue.toString(),
      },
      validation: {
        rollForwardOk: Math.abs(rollForwardDifference) < 0.0001,
        rollForwardDifference: rollForwardDifference.toString(),
      },
    };
  }

  async getTrialBalance(asOfDate?: Date) {
    const allAccounts = await this.getAccounts();
    const result = [];
    const asOf = asOfDate ? endOfDay(asOfDate) : undefined;

    for (const account of allAccounts) {
      const normal = normalSideForAccountType(account.type);
      const [movementRow] = db
        .select({ total: ledgerSumByNormal(normal) })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, account.id), ...(asOf ? [lte(ledgerEntries.entryDate, asOf)] : [])))
        .all();

      const opening = parseAmount(account.openingBalance || "0");
      const movement = parseAmount(movementRow?.total || "0");
      const closing = opening + movement;

      let debit = 0;
      let credit = 0;
      if (closing >= 0) {
        if (normal === "DEBIT") debit = closing;
        else credit = closing;
      } else {
        if (normal === "DEBIT") credit = Math.abs(closing);
        else debit = Math.abs(closing);
      }

      result.push({
        account,
        debit: debit.toString(),
        credit: credit.toString(),
      });
    }

    const summary = computeTrialBalanceTotals(result);

    return {
      rows: result,
      totals: summary.totals,
      validation: { balanced: summary.balanced, difference: summary.difference },
    };
  }

  async getProfitLoss(startDate?: Date, endDate?: Date) {
    const from = startDate ?? new Date(0);
    const to = endDate ? endOfDay(endDate) : endOfDay(new Date());

    const incomeIds = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.type, "income" as any))
      .all()
      .map((r) => r.id);
    const cogsIds = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.type, "cogs" as any))
      .all()
      .map((r) => r.id);

    const [revenueRow] = incomeIds.length
      ? db
          .select({ total: ledgerSumByNormal("CREDIT") })
          .from(ledgerEntries)
          .where(and(inArray(ledgerEntries.accountId, incomeIds), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
          .all()
      : [{ total: "0" } as any];

    const [cogsRow] = cogsIds.length
      ? db
          .select({ total: ledgerSumByNormal("DEBIT") })
          .from(ledgerEntries)
          .where(and(inArray(ledgerEntries.accountId, cogsIds), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
          .all()
      : [{ total: "0" } as any];

    const operatingExpenses = await this.sumExpenseMovements(from, to);
    const revenue = parseAmount(revenueRow?.total || "0");
    const costOfSales = parseAmount(cogsRow?.total || "0");
    const grossProfit = revenue - costOfSales;
    const netProfit = grossProfit - operatingExpenses;

    return {
      period: { fromDate: from, toDate: to },
      revenue: revenue.toString(),
      costOfSales: costOfSales.toString(),
      grossProfit: grossProfit.toString(),
      operatingExpenses: operatingExpenses.toString(),
      netProfit: netProfit.toString(),
    };
  }

  async getPurchaseReport(filters?: {
    fromDate?: Date;
    toDate?: Date;
    supplierId?: number;
    productId?: number;
    paymentStatus?: "paid" | "partial" | "unpaid";
  }) {
    const conditions = [isNull(purchases.deletedAt)];
    if (filters?.fromDate) conditions.push(gte(purchases.purchaseDate, filters.fromDate));
    if (filters?.toDate) conditions.push(lte(purchases.purchaseDate, endOfDay(filters.toDate)));
    if (filters?.supplierId) conditions.push(eq(purchases.supplierId, filters.supplierId));

    if (filters?.productId) {
      const purchaseIds = db
        .select({ purchaseId: purchaseItems.purchaseId })
        .from(purchaseItems)
        .where(and(eq(purchaseItems.productId, filters.productId), isNull(purchaseItems.deletedAt)))
        .all()
        .map((r) => r.purchaseId);
      if (!purchaseIds.length) {
        return { rows: [], totals: { subtotal: "0", discount: "0", tax: "0", otherCharges: "0", total: "0", paid: "0", balance: "0" } };
      }
      conditions.push(inArray(purchases.id, purchaseIds));
    }

    const rows = db
      .select({
        id: purchases.id,
        invoiceNumber: purchases.invoiceNumber,
        purchaseDate: purchases.purchaseDate,
        supplierId: purchases.supplierId,
        supplierName: accounts.name,
        subtotal: purchases.subtotal,
        discount: purchases.chargesLess,
        tax: purchases.taxAmount,
        otherCharges: purchases.chargesAdd,
        total: purchases.totalAmount,
        paid: purchases.paidAmount,
      })
      .from(purchases)
      .leftJoin(accounts, eq(purchases.supplierId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(purchases.purchaseDate))
      .all()
      .map((r) => {
        const total = parseAmount(r.total || "0");
        const paid = parseAmount(r.paid || "0");
        const balance = Math.max(total - paid, 0);
        return {
          id: r.id,
          invoiceNumber: r.invoiceNumber,
          purchaseDate: new Date(r.purchaseDate as any),
          supplierId: r.supplierId,
          supplierName: r.supplierName || "",
          subtotal: parseAmount(r.subtotal || "0").toString(),
          discount: parseAmount(r.discount || "0").toString(),
          tax: parseAmount(r.tax || "0").toString(),
          otherCharges: parseAmount(r.otherCharges || "0").toString(),
          total: total.toString(),
          paid: paid.toString(),
          balance: balance.toString(),
        };
      })
      .filter((r) => {
        if (!filters?.paymentStatus) return true;
        const total = parseAmount(r.total);
        const paid = parseAmount(r.paid);
        if (filters.paymentStatus === "paid") return paid >= total && total > 0;
        if (filters.paymentStatus === "unpaid") return paid <= 0 && total > 0;
        return paid > 0 && paid < total;
      });

    const totals = rows.reduce(
      (acc, r) => {
        acc.subtotal += parseAmount(r.subtotal);
        acc.discount += parseAmount(r.discount);
        acc.tax += parseAmount(r.tax);
        acc.otherCharges += parseAmount(r.otherCharges);
        acc.total += parseAmount(r.total);
        acc.paid += parseAmount(r.paid);
        acc.balance += parseAmount(r.balance);
        return acc;
      },
      { subtotal: 0, discount: 0, tax: 0, otherCharges: 0, total: 0, paid: 0, balance: 0 },
    );

    return {
      rows,
      totals: {
        subtotal: totals.subtotal.toString(),
        discount: totals.discount.toString(),
        tax: totals.tax.toString(),
        otherCharges: totals.otherCharges.toString(),
        total: totals.total.toString(),
        paid: totals.paid.toString(),
        balance: totals.balance.toString(),
      },
    };
  }

  async getSalesReport(filters?: {
    fromDate?: Date;
    toDate?: Date;
    customerId?: number;
    productId?: number;
    paymentStatus?: "paid" | "partial" | "unpaid";
  }) {
    const conditions = [];
    if (filters?.fromDate) conditions.push(gte(sales.saleDate, filters.fromDate));
    if (filters?.toDate) conditions.push(lte(sales.saleDate, endOfDay(filters.toDate)));
    if (filters?.customerId) conditions.push(eq(sales.customerId, filters.customerId));

    if (filters?.productId) {
      const saleIds = db
        .select({ saleId: saleItems.saleId })
        .from(saleItems)
        .where(eq(saleItems.productId, filters.productId))
        .all()
        .map((r) => r.saleId);
      if (!saleIds.length) {
        return { rows: [], totals: { subtotal: "0", discount: "0", tax: "0", otherCharges: "0", total: "0", received: "0", balance: "0" } };
      }
      conditions.push(inArray(sales.id, saleIds));
    }

    const rows = db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        saleDate: sales.saleDate,
        customerId: sales.customerId,
        customerName: accounts.name,
        subtotal: sales.subtotal,
        tax: sales.taxAmount,
        loading: sales.loadingCharges,
        weighing: sales.weighingCharges,
        other: sales.otherCharges,
        total: sales.totalAmount,
        received: sales.paidAmount,
      })
      .from(sales)
      .leftJoin(accounts, eq(sales.customerId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(sales.saleDate))
      .all()
      .map((r) => {
        const total = parseAmount(r.total || "0");
        const received = parseAmount(r.received || "0");
        const balance = Math.max(total - received, 0);
        const otherCharges = parseAmount(r.loading || "0") + parseAmount(r.weighing || "0") + parseAmount(r.other || "0");
        return {
          id: r.id,
          invoiceNumber: r.invoiceNumber,
          saleDate: new Date(r.saleDate as any),
          customerId: r.customerId,
          customerName: r.customerName || "",
          subtotal: parseAmount(r.subtotal || "0").toString(),
          discount: "0",
          tax: parseAmount(r.tax || "0").toString(),
          otherCharges: otherCharges.toString(),
          total: total.toString(),
          received: received.toString(),
          balance: balance.toString(),
        };
      })
      .filter((r) => {
        if (!filters?.paymentStatus) return true;
        const total = parseAmount(r.total);
        const received = parseAmount(r.received);
        if (filters.paymentStatus === "paid") return received >= total && total > 0;
        if (filters.paymentStatus === "unpaid") return received <= 0 && total > 0;
        return received > 0 && received < total;
      });

    const totals = rows.reduce(
      (acc, r) => {
        acc.subtotal += parseAmount(r.subtotal);
        acc.discount += parseAmount(r.discount);
        acc.tax += parseAmount(r.tax);
        acc.otherCharges += parseAmount(r.otherCharges);
        acc.total += parseAmount(r.total);
        acc.received += parseAmount(r.received);
        acc.balance += parseAmount(r.balance);
        return acc;
      },
      { subtotal: 0, discount: 0, tax: 0, otherCharges: 0, total: 0, received: 0, balance: 0 },
    );

    return {
      rows,
      totals: {
        subtotal: totals.subtotal.toString(),
        discount: totals.discount.toString(),
        tax: totals.tax.toString(),
        otherCharges: totals.otherCharges.toString(),
        total: totals.total.toString(),
        received: totals.received.toString(),
        balance: totals.balance.toString(),
      },
    };
  }

  async getPeriodPurchases(startDate: Date, endDate: Date, supplierId?: number, groupBy: "day" | "week" | "month" = "month") {
    const from = startDate;
    const to = endOfDay(endDate);
    const conditions = [gte(purchases.purchaseDate, from), lte(purchases.purchaseDate, to), isNull(purchases.deletedAt)];
    if (supplierId) conditions.push(eq(purchases.supplierId, supplierId));

    const baseRows = db
      .select({
        purchaseDate: purchases.purchaseDate,
        totalAmount: purchases.totalAmount,
        paidAmount: purchases.paidAmount,
      })
      .from(purchases)
      .where(and(...conditions))
      .orderBy(purchases.purchaseDate)
      .all();

    const grouped = new Map<string, { periodStart: Date; periodEnd: Date; totalAmount: number; paidAmount: number; balanceAmount: number; invoiceCount: number }>();

    for (const row of baseRows) {
      const dt = new Date(row.purchaseDate as any);
      const periodStart =
        groupBy === "day"
          ? new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
          : groupBy === "week"
            ? startOfWeek(dt)
            : startOfMonth(dt);
      const periodEnd =
        groupBy === "day" ? endOfDay(periodStart) : groupBy === "week" ? endOfWeek(dt) : endOfMonth(dt);

      const key =
        groupBy === "day"
          ? periodStart.toISOString().slice(0, 10)
          : groupBy === "week"
            ? `${periodStart.getFullYear()}-W${String(weekNumber(periodStart)).padStart(2, "0")}`
            : `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;

      const totalAmount = parseAmount(row.totalAmount || "0");
      const paidAmount = parseAmount(row.paidAmount || "0");
      const balanceAmount = Math.max(totalAmount - paidAmount, 0);

      const current = grouped.get(key) || {
        periodStart,
        periodEnd,
        totalAmount: 0,
        paidAmount: 0,
        balanceAmount: 0,
        invoiceCount: 0,
      };
      current.totalAmount += totalAmount;
      current.paidAmount += paidAmount;
      current.balanceAmount += balanceAmount;
      current.invoiceCount += 1;
      grouped.set(key, current);
    }

    const rows = Array.from(grouped.entries())
      .map(([period, data]) => ({
        period,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        totalAmount: data.totalAmount.toString(),
        paidAmount: data.paidAmount.toString(),
        balanceAmount: data.balanceAmount.toString(),
        invoiceCount: data.invoiceCount,
      }))
      .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime());

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalAmount += parseAmount(r.totalAmount);
        acc.paidAmount += parseAmount(r.paidAmount);
        acc.balanceAmount += parseAmount(r.balanceAmount);
        acc.invoiceCount += r.invoiceCount;
        return acc;
      },
      { totalAmount: 0, paidAmount: 0, balanceAmount: 0, invoiceCount: 0 },
    );

    return {
      rows,
      totals: {
        totalAmount: totals.totalAmount.toString(),
        paidAmount: totals.paidAmount.toString(),
        balanceAmount: totals.balanceAmount.toString(),
        invoiceCount: totals.invoiceCount,
      },
    };
  }

  async getPeriodSales(startDate: Date, endDate: Date, customerId?: number, groupBy: "day" | "week" | "month" = "month") {
    const from = startDate;
    const to = endOfDay(endDate);
    const conditions = [gte(sales.saleDate, from), lte(sales.saleDate, to)];
    if (customerId) conditions.push(eq(sales.customerId, customerId));

    const baseRows = db
      .select({
        saleDate: sales.saleDate,
        totalAmount: sales.totalAmount,
        paidAmount: sales.paidAmount,
      })
      .from(sales)
      .where(and(...conditions))
      .orderBy(sales.saleDate)
      .all();

    const grouped = new Map<string, { periodStart: Date; periodEnd: Date; totalAmount: number; receivedAmount: number; balanceAmount: number; invoiceCount: number }>();

    for (const row of baseRows) {
      const dt = new Date(row.saleDate as any);
      const periodStart =
        groupBy === "day"
          ? new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
          : groupBy === "week"
            ? startOfWeek(dt)
            : startOfMonth(dt);
      const periodEnd =
        groupBy === "day" ? endOfDay(periodStart) : groupBy === "week" ? endOfWeek(dt) : endOfMonth(dt);

      const key =
        groupBy === "day"
          ? periodStart.toISOString().slice(0, 10)
          : groupBy === "week"
            ? `${periodStart.getFullYear()}-W${String(weekNumber(periodStart)).padStart(2, "0")}`
            : `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;

      const totalAmount = parseAmount(row.totalAmount || "0");
      const receivedAmount = parseAmount(row.paidAmount || "0");
      const balanceAmount = Math.max(totalAmount - receivedAmount, 0);

      const current = grouped.get(key) || {
        periodStart,
        periodEnd,
        totalAmount: 0,
        receivedAmount: 0,
        balanceAmount: 0,
        invoiceCount: 0,
      };
      current.totalAmount += totalAmount;
      current.receivedAmount += receivedAmount;
      current.balanceAmount += balanceAmount;
      current.invoiceCount += 1;
      grouped.set(key, current);
    }

    const rows = Array.from(grouped.entries())
      .map(([period, data]) => ({
        period,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        totalAmount: data.totalAmount.toString(),
        receivedAmount: data.receivedAmount.toString(),
        balanceAmount: data.balanceAmount.toString(),
        invoiceCount: data.invoiceCount,
      }))
      .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime());

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalAmount += parseAmount(r.totalAmount);
        acc.receivedAmount += parseAmount(r.receivedAmount);
        acc.balanceAmount += parseAmount(r.balanceAmount);
        acc.invoiceCount += r.invoiceCount;
        return acc;
      },
      { totalAmount: 0, receivedAmount: 0, balanceAmount: 0, invoiceCount: 0 },
    );

    return {
      rows,
      totals: {
        totalAmount: totals.totalAmount.toString(),
        receivedAmount: totals.receivedAmount.toString(),
        balanceAmount: totals.balanceAmount.toString(),
        invoiceCount: totals.invoiceCount,
      },
    };
  }

  async getGrossProfit(startDate: Date, endDate: Date) {
    const from = startDate;
    const to = endOfDay(endDate);

    const incomeAccounts = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.type, "income" as any)).all();
    const cogsAccounts = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.type, "cogs" as any)).all();
    const incomeAccountIds = incomeAccounts.map((a) => a.id);
    const cogsAccountIds = cogsAccounts.map((a) => a.id);

    const [revenueRow] = incomeAccountIds.length
      ? db
          .select({ total: ledgerSumByNormal("CREDIT") })
          .from(ledgerEntries)
          .where(and(inArray(ledgerEntries.accountId, incomeAccountIds), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
          .all()
      : [{ total: "0" } as any];

    const [cogsRow] = cogsAccountIds.length
      ? db
          .select({ total: ledgerSumByNormal("DEBIT") })
          .from(ledgerEntries)
          .where(and(inArray(ledgerEntries.accountId, cogsAccountIds), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
          .all()
      : [{ total: "0" } as any];

    const salesRows = db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        saleDate: sales.saleDate,
        subtotal: sales.subtotal,
        totalAmount: sales.totalAmount,
        taxAmount: sales.taxAmount,
      })
      .from(sales)
      .where(and(gte(sales.saleDate, from), lte(sales.saleDate, to)))
      .orderBy(desc(sales.saleDate))
      .all();

    const cogsBySale = new Map<number, string>(
      cogsAccountIds.length
        ? db
            .select({
              saleId: ledgerEntries.referenceId,
              amount: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
            })
            .from(ledgerEntries)
            .where(
              and(
                inArray(ledgerEntries.accountId, cogsAccountIds),
                eq(ledgerEntries.referenceType, "sale"),
                gte(ledgerEntries.entryDate, from),
                lte(ledgerEntries.entryDate, to),
              ),
            )
            .groupBy(ledgerEntries.referenceId)
            .all()
            .map((r) => [r.saleId ?? 0, r.amount])
        : [],
    );

    const rows = salesRows.map((s) => {
      const netSales = Math.max(parseAmount(s.totalAmount || "0") - parseAmount(s.taxAmount || "0"), 0);
      const cogs = parseAmount(cogsBySale.get(s.id) || "0");
      const profit = netSales - cogs;
      return {
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        saleDate: new Date(s.saleDate as any),
        netSales: netSales.toString(),
        costOfGoodsSold: cogs.toString(),
        grossProfit: profit.toString(),
      };
    });

    const netSales = rows.reduce((sum, r) => sum + parseAmount(r.netSales), 0) || parseAmount(revenueRow?.total || "0");
    const costOfGoodsSold = rows.reduce((sum, r) => sum + parseAmount(r.costOfGoodsSold), 0) || parseAmount(cogsRow?.total || "0");
    const grossProfit = netSales - costOfGoodsSold;
    const margin = netSales !== 0 ? (grossProfit / netSales) * 100 : 0;

    return {
      netSales: netSales.toString(),
      costOfGoodsSold: costOfGoodsSold.toString(),
      grossProfit: grossProfit.toString(),
      grossMarginPercent: margin.toFixed(2),
      rows,
    };
  }

  async getDayBook(date: Date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = endOfDay(dayStart);

    const accountRows = db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        isSystemAccount: accounts.isSystemAccount,
      })
      .from(accounts)
      .all();

    const isCashBankAccount = (account: { name?: string | null; type?: string | null; isSystemAccount?: boolean | null }) => {
      const name = (account.name || "").toLowerCase();
      const isCash = name.includes("cash");
      const isBank = name.includes("bank") || account.type === "bank";
      const isSystemCash = account.isSystemAccount && account.type === "asset";
      return isCash || isBank || isSystemCash;
    };

    const cashBankIds = accountRows.filter(isCashBankAccount).map((a) => a.id);
    const cashBankIdSet = new Set(cashBankIds);

    const [openingRow] = cashBankIds.length
      ? db
          .select({
            total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
          })
          .from(ledgerEntries)
          .where(and(inArray(ledgerEntries.accountId, cashBankIds), lt(ledgerEntries.entryDate, dayStart)))
          .all()
      : [{ total: "0" }];
    const openingValue = parseAmount(openingRow?.total || "0");
    const openingBalance = {
      amount: Math.abs(openingValue).toString(),
      type: openingValue === 0 ? "" : openingValue >= 0 ? "DR" : "CR",
    };

    const purchaseRows = db
      .select({
        id: purchases.id,
        voucherNo: purchases.invoiceNumber,
        voucherDate: purchases.purchaseDate,
        notes: purchases.notes,
        partyName: accounts.name,
      })
      .from(purchases)
      .leftJoin(accounts, eq(purchases.supplierId, accounts.id))
      .where(and(isNull(purchases.deletedAt), gte(purchases.purchaseDate, dayStart), lte(purchases.purchaseDate, dayEnd)))
      .all();

    const saleRows = db
      .select({
        id: sales.id,
        voucherNo: sales.invoiceNumber,
        voucherDate: sales.saleDate,
        notes: sales.notes,
        partyName: accounts.name,
      })
      .from(sales)
      .leftJoin(accounts, eq(sales.customerId, accounts.id))
      .where(and(gte(sales.saleDate, dayStart), lte(sales.saleDate, dayEnd)))
      .all();

    const receiptVoucherRows = db
      .select({
        id: receiptVouchers.id,
        voucherNo: receiptVouchers.voucherNumber,
        voucherDate: receiptVouchers.voucherDate,
        voucherType: receiptVouchers.voucherType,
        narration: receiptVouchers.narration,
      })
      .from(receiptVouchers)
      .where(and(isNull(receiptVouchers.deletedAt), gte(receiptVouchers.voucherDate, dayStart), lte(receiptVouchers.voucherDate, dayEnd)))
      .all();

    const journalRows = db
      .select({
        id: journalVouchers.id,
        voucherNo: journalVouchers.voucherNo,
        voucherDate: journalVouchers.voucherDate,
        narration: journalVouchers.narration,
      })
      .from(journalVouchers)
      .where(and(gte(journalVouchers.voucherDate, dayStart), lte(journalVouchers.voucherDate, dayEnd)))
      .all();

    const expenseRows = db
      .select({
        id: expenseEntries.id,
        voucherNo: expenseEntries.voucherNo,
        voucherDate: expenseEntries.expenseDate,
        narration: expenseEntries.description,
      })
      .from(expenseEntries)
      .where(and(gte(expenseEntries.expenseDate, dayStart), lte(expenseEntries.expenseDate, dayEnd)))
      .all();

    const contraRows = db
      .select({
        id: contraVouchers.id,
        voucherNo: contraVouchers.voucherNo,
        voucherDate: contraVouchers.voucherDate,
        narration: contraVouchers.narration,
      })
      .from(contraVouchers)
      .where(and(gte(contraVouchers.voucherDate, dayStart), lte(contraVouchers.voucherDate, dayEnd)))
      .all();

    type VoucherMeta = {
      referenceType: string;
      referenceId: number;
      voucherNo: string;
      typeCode: string;
      date: Date;
      partyName: string;
      narration: string;
    };

    const voucherMetaByKey = new Map<string, VoucherMeta>();
    const addMeta = (meta: VoucherMeta) => {
      const key = `${meta.referenceType}:${meta.referenceId}`;
      voucherMetaByKey.set(key, meta);
    };

    for (const row of purchaseRows) {
      addMeta({
        referenceType: "purchase",
        referenceId: row.id,
        voucherNo: row.voucherNo,
        typeCode: "PI",
        date: new Date(row.voucherDate as any),
        partyName: row.partyName || "",
        narration: row.notes || "",
      });
    }

    for (const row of saleRows) {
      addMeta({
        referenceType: "sale",
        referenceId: row.id,
        voucherNo: row.voucherNo,
        typeCode: "SV",
        date: new Date(row.voucherDate as any),
        partyName: row.partyName || "",
        narration: row.notes || "",
      });
    }

    for (const row of receiptVoucherRows) {
      const refType = row.voucherType === "CR" ? "receipt" : "payment";
      addMeta({
        referenceType: refType,
        referenceId: row.id,
        voucherNo: row.voucherNo,
        typeCode: refType === "receipt" ? "RV" : "PV",
        date: new Date(row.voucherDate as any),
        partyName: "",
        narration: row.narration || "",
      });
    }

    for (const row of journalRows) {
      addMeta({
        referenceType: "journal_voucher",
        referenceId: row.id,
        voucherNo: row.voucherNo,
        typeCode: "JV",
        date: new Date(row.voucherDate as any),
        partyName: "",
        narration: row.narration || "",
      });
    }

    for (const row of expenseRows) {
      addMeta({
        referenceType: "expense",
        referenceId: row.id,
        voucherNo: row.voucherNo,
        typeCode: "EV",
        date: new Date(row.voucherDate as any),
        partyName: "",
        narration: row.narration || "",
      });
    }

    for (const row of contraRows) {
      addMeta({
        referenceType: "contra",
        referenceId: row.id,
        voucherNo: row.voucherNo,
        typeCode: "CV",
        date: new Date(row.voucherDate as any),
        partyName: "",
        narration: row.narration || "",
      });
    }

    const entries = db
      .select({
        id: ledgerEntries.id,
        entryDate: ledgerEntries.entryDate,
        transactionType: ledgerEntries.transactionType,
        amount: ledgerEntries.amount,
        description: ledgerEntries.description,
        referenceType: ledgerEntries.referenceType,
        referenceId: ledgerEntries.referenceId,
        accountId: ledgerEntries.accountId,
        accountName: accounts.name,
        accountType: accounts.type,
        isSystemAccount: accounts.isSystemAccount,
      })
      .from(ledgerEntries)
      .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(and(gte(ledgerEntries.entryDate, dayStart), lte(ledgerEntries.entryDate, dayEnd)))
      .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
      .all();

    type Entry = (typeof entries)[number];
    type Group = { meta: VoucherMeta; entries: Entry[] };

    const groupMap = new Map<string, Group>();
    for (const entry of entries) {
      if (!entry.referenceType || !entry.referenceId) continue;
      const key = `${entry.referenceType}:${entry.referenceId}`;
      const meta = voucherMetaByKey.get(key);
      if (!meta) continue;
      const group = groupMap.get(key);
      if (group) group.entries.push(entry);
      else groupMap.set(key, { meta, entries: [entry] });
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => {
      const dateDiff = a.meta.date.getTime() - b.meta.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.meta.referenceId - b.meta.referenceId;
    });

    const rows: Array<{
      srNo: number;
      id: string;
      type: string;
      partyName: string;
      mode: string;
      receipt: string;
      payment: string;
      balanceAmount: string;
      balanceType: "DR" | "CR" | "";
      date: Date;
      referenceType?: string | null;
      referenceId?: number | null;
    }> = [];

    let runningBalance = openingValue;
    let totalReceipt = 0;
    let totalPayment = 0;

    const resolvePartyName = (group: Group) => {
      if (group.meta.partyName) return group.meta.partyName;
      const nonCash = group.entries.find((e) => !cashBankIdSet.has(e.accountId));
      return nonCash?.accountName || "";
    };

    const resolveMode = (group: Group) => {
      const cashEntry = group.entries.find((e) => cashBankIdSet.has(e.accountId));
      const raw = group.meta.narration || cashEntry?.accountName || group.entries[0]?.description || "";
      return raw ? raw.toUpperCase() : "";
    };

    groups.forEach((group, index) => {
      const cashEntries = group.entries.filter((e) => cashBankIdSet.has(e.accountId));
      const receipt = cashEntries.reduce((sum, e) => sum + (e.transactionType === "debit" ? parseAmount(e.amount) : 0), 0);
      const payment = cashEntries.reduce((sum, e) => sum + (e.transactionType === "credit" ? parseAmount(e.amount) : 0), 0);

      runningBalance += receipt - payment;
      totalReceipt += receipt;
      totalPayment += payment;

      rows.push({
        srNo: index + 1,
        id: group.meta.voucherNo || "-",
        type: group.meta.typeCode,
        partyName: resolvePartyName(group),
        mode: resolveMode(group),
        receipt: receipt.toString(),
        payment: payment.toString(),
        balanceAmount: Math.abs(runningBalance).toString(),
        balanceType: runningBalance === 0 ? "" : runningBalance >= 0 ? "DR" : "CR",
        date: group.meta.date,
        referenceType: group.meta.referenceType,
        referenceId: group.meta.referenceId,
      });
    });

    return {
      openingBalance,
      rows,
      totals: {
        receipt: totalReceipt.toString(),
        payment: totalPayment.toString(),
      },
    };
  }

  async getOutstandingCustomers(asOfDate: Date, customerId?: number) {
    const to = endOfDay(asOfDate);
    const saleConditions = [lte(sales.saleDate, to)];
    if (customerId) saleConditions.push(eq(sales.customerId, customerId));

    const salesRows = db
      .select({
        saleId: sales.id,
        invoiceNumber: sales.invoiceNumber,
        saleDate: sales.saleDate,
        customerId: sales.customerId,
        customerName: accounts.name,
        invoiceAmount: sales.totalAmount,
      })
      .from(sales)
      .leftJoin(accounts, eq(sales.customerId, accounts.id))
      .where(and(...saleConditions))
      .orderBy(sales.saleDate)
      .all();

    const customerIds = (salesRows.map((r) => r.customerId).filter(Boolean) as number[])
      .filter((id, index, arr) => arr.indexOf(id) === index);
    const ledgerByCustomer = new Map<number, LedgerEntry[]>(
      customerIds.length
        ? db
            .select()
            .from(ledgerEntries)
            .where(and(inArray(ledgerEntries.accountId, customerIds), lte(ledgerEntries.entryDate, to)))
            .orderBy(ledgerEntries.entryDate)
            .all()
            .reduce((acc, entry) => {
              const list = (acc.get(entry.accountId) as LedgerEntry[] | undefined) || [];
              list.push(entry as any);
              acc.set(entry.accountId, list);
              return acc;
            }, new Map<number, LedgerEntry[]>())
        : new Map(),
    );

    const rows: Array<{
      saleId: number;
      invoiceNumber: string;
      customerId: number;
      customerName: string;
      invoiceAmount: string;
      receivedAmount: string;
      outstandingAmount: string;
      dueDate: Date | null;
      saleDate: Date;
      daysOutstanding: number;
      bucket0To30: string;
      bucket31To60: string;
      bucket61To90: string;
      bucket91Plus: string;
    }> = [];

    for (const cid of customerIds) {
      const customerSales = salesRows.filter((r) => r.customerId === cid).sort((a, b) => new Date(a.saleDate as any).getTime() - new Date(b.saleDate as any).getTime());
      const ledger = ledgerByCustomer.get(cid) || [];
      const totalCredits = ledger.filter((l) => l.transactionType === "credit").reduce((sum, l) => sum + parseAmount(l.amount), 0);
      let remainingCredits = totalCredits;

      for (const sale of customerSales) {
        const invoice = parseAmount(sale.invoiceAmount || "0");
        const applied = Math.min(invoice, remainingCredits);
        remainingCredits -= applied;
        const outstanding = Math.max(invoice - applied, 0);
        const saleDate = new Date(sale.saleDate as any);
        const dueDate = saleDate;
        const daysOutstanding = Math.max(
          Math.floor((to.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
          0,
        );
        const aging = computeAgingBuckets(outstanding, daysOutstanding);
        rows.push({
          saleId: sale.saleId,
          invoiceNumber: sale.invoiceNumber,
          saleDate,
          customerId: sale.customerId,
          customerName: sale.customerName || "",
          invoiceAmount: invoice.toString(),
          receivedAmount: (invoice - outstanding).toString(),
          outstandingAmount: outstanding.toString(),
          dueDate,
          daysOutstanding,
          bucket0To30: aging.buckets["0-30"].toString(),
          bucket31To60: aging.buckets["31-60"].toString(),
          bucket61To90: aging.buckets["61-90"].toString(),
          bucket91Plus: aging.buckets["91+"].toString(),
        });
      }
    }

    const filteredRows = rows.filter((r) => parseAmount(r.outstandingAmount) > 0);

    const totals = filteredRows.reduce(
      (acc, r) => {
        acc.invoiceAmount += parseAmount(r.invoiceAmount);
        acc.receivedAmount += parseAmount(r.receivedAmount);
        acc.outstandingAmount += parseAmount(r.outstandingAmount);
        acc.bucket0To30 += parseAmount(r.bucket0To30);
        acc.bucket31To60 += parseAmount(r.bucket31To60);
        acc.bucket61To90 += parseAmount(r.bucket61To90);
        acc.bucket91Plus += parseAmount(r.bucket91Plus);
        return acc;
      },
      { invoiceAmount: 0, receivedAmount: 0, outstandingAmount: 0, bucket0To30: 0, bucket31To60: 0, bucket61To90: 0, bucket91Plus: 0 },
    );

    return {
      rows: filteredRows,
      totals: {
        invoiceAmount: totals.invoiceAmount.toString(),
        receivedAmount: totals.receivedAmount.toString(),
        outstandingAmount: totals.outstandingAmount.toString(),
        bucket0To30: totals.bucket0To30.toString(),
        bucket31To60: totals.bucket31To60.toString(),
        bucket61To90: totals.bucket61To90.toString(),
        bucket91Plus: totals.bucket91Plus.toString(),
      },
    };
  }

  async getOutstandingSuppliers(asOfDate: Date, supplierId?: number) {
    const to = endOfDay(asOfDate);
    const conditions = [lte(purchases.purchaseDate, to), isNull(purchases.deletedAt)];
    if (supplierId) conditions.push(eq(purchases.supplierId, supplierId));

    const purchasesRows = db
      .select({
        purchaseId: purchases.id,
        invoiceNumber: purchases.invoiceNumber,
        purchaseDate: purchases.purchaseDate,
        supplierId: purchases.supplierId,
        supplierName: accounts.name,
        billAmount: purchases.totalAmount,
        dueDate: purchases.dueDate,
      })
      .from(purchases)
      .leftJoin(accounts, eq(purchases.supplierId, accounts.id))
      .where(and(...conditions))
      .orderBy(purchases.purchaseDate)
      .all();

    const supplierIds = (purchasesRows.map((r) => r.supplierId).filter(Boolean) as number[])
      .filter((id, index, arr) => arr.indexOf(id) === index);
    const ledgerBySupplier = new Map<number, LedgerEntry[]>(
      supplierIds.length
        ? db
            .select()
            .from(ledgerEntries)
            .where(and(inArray(ledgerEntries.accountId, supplierIds), lte(ledgerEntries.entryDate, to)))
            .orderBy(ledgerEntries.entryDate)
            .all()
            .reduce((acc, entry) => {
              const list = (acc.get(entry.accountId) as LedgerEntry[] | undefined) || [];
              list.push(entry as any);
              acc.set(entry.accountId, list);
              return acc;
            }, new Map<number, LedgerEntry[]>())
        : new Map(),
    );

    const rows: Array<{
      purchaseId: number;
      invoiceNumber: string;
      purchaseDate: Date;
      supplierId: number;
      supplierName: string;
      billAmount: string;
      paidAmount: string;
      outstandingAmount: string;
      dueDate: Date | null;
      daysOutstanding: number;
      bucket0To30: string;
      bucket31To60: string;
      bucket61To90: string;
      bucket91Plus: string;
    }> = [];

    for (const sid of supplierIds) {
      const supplierPurchases = purchasesRows.filter((r) => r.supplierId === sid).sort((a, b) => new Date(a.purchaseDate as any).getTime() - new Date(b.purchaseDate as any).getTime());
      const ledger = ledgerBySupplier.get(sid) || [];
      const totalDebits = ledger.filter((l) => l.transactionType === "debit").reduce((sum, l) => sum + parseAmount(l.amount), 0);
      let remainingDebits = totalDebits;

      for (const pur of supplierPurchases) {
        const bill = parseAmount(pur.billAmount || "0");
        const applied = Math.min(bill, remainingDebits);
        remainingDebits -= applied;
        const outstanding = Math.max(bill - applied, 0);
        const purchaseDate = new Date(pur.purchaseDate as any);
        const dueDate = pur.dueDate ? new Date(pur.dueDate as any) : purchaseDate;
        const daysOutstanding = Math.max(
          Math.floor((to.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
          0,
        );
        const aging = computeAgingBuckets(outstanding, daysOutstanding);
        rows.push({
          purchaseId: pur.purchaseId,
          invoiceNumber: pur.invoiceNumber,
          purchaseDate,
          supplierId: pur.supplierId,
          supplierName: pur.supplierName || "",
          billAmount: bill.toString(),
          paidAmount: (bill - outstanding).toString(),
          outstandingAmount: outstanding.toString(),
          dueDate,
          daysOutstanding,
          bucket0To30: aging.buckets["0-30"].toString(),
          bucket31To60: aging.buckets["31-60"].toString(),
          bucket61To90: aging.buckets["61-90"].toString(),
          bucket91Plus: aging.buckets["91+"].toString(),
        });
      }
    }

    const filteredRows = rows.filter((r) => parseAmount(r.outstandingAmount) > 0);

    const totals = filteredRows.reduce(
      (acc, r) => {
        acc.billAmount += parseAmount(r.billAmount);
        acc.paidAmount += parseAmount(r.paidAmount);
        acc.outstandingAmount += parseAmount(r.outstandingAmount);
        acc.bucket0To30 += parseAmount(r.bucket0To30);
        acc.bucket31To60 += parseAmount(r.bucket31To60);
        acc.bucket61To90 += parseAmount(r.bucket61To90);
        acc.bucket91Plus += parseAmount(r.bucket91Plus);
        return acc;
      },
      { billAmount: 0, paidAmount: 0, outstandingAmount: 0, bucket0To30: 0, bucket31To60: 0, bucket61To90: 0, bucket91Plus: 0 },
    );

    return {
      rows: filteredRows,
      totals: {
        billAmount: totals.billAmount.toString(),
        paidAmount: totals.paidAmount.toString(),
        outstandingAmount: totals.outstandingAmount.toString(),
        bucket0To30: totals.bucket0To30.toString(),
        bucket31To60: totals.bucket31To60.toString(),
        bucket61To90: totals.bucket61To90.toString(),
        bucket91Plus: totals.bucket91Plus.toString(),
      },
    };
  }

  private async sumExpenseMovements(startDate: Date, endDate: Date) {
    const from = startDate;
    const to = endOfDay(endDate);
    const expenseIds = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(inArray(accounts.type, ["expense", "salary"] as any))
      .all()
      .map((r) => r.id);

    if (expenseIds.length === 0) return 0;

    const [row] = db
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(inArray(ledgerEntries.accountId, expenseIds), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
      .all();

    return parseAmount(row?.total || "0");
  }

  async getIncomeStatement(startDate: Date, endDate: Date) {
    const summary = await this.getProfitLoss(startDate, endDate);
    return {
      period: summary.period,
      revenue: summary.revenue,
      costOfSales: summary.costOfSales,
      grossProfit: summary.grossProfit,
      operatingExpenses: summary.operatingExpenses,
      netProfit: summary.netProfit,
    };
  }

  private async sumLedgerBalancesAsOf(asOfDate: Date, accountType: string, normal: NormalSide) {
    const asOf = endOfDay(asOfDate);
    const typeAccounts = db
      .select({ id: accounts.id, opening: accounts.openingBalance })
      .from(accounts)
      .where(eq(accounts.type, accountType as any))
      .all();
    const ids = typeAccounts.map((a) => a.id);
    if (ids.length === 0) return 0;

    const [movementRow] = db
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = ${normal === "DEBIT" ? sql`'debit'` : sql`'credit'`} THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(inArray(ledgerEntries.accountId, ids), lte(ledgerEntries.entryDate, asOf)))
      .all();

    const openingSum = typeAccounts.reduce((sum, a) => sum + parseAmount(a.opening || "0"), 0);
    return openingSum + parseAmount(movementRow?.total || "0");
  }

  async getBalanceSheet(asOfDate: Date) {
    const asOf = endOfDay(asOfDate);

    const cash = await this.ensureCashAccountInternal(db);
    const [cashMovement] = db
      .select({
        movement: sql<string>`COALESCE(SUM(CASE WHEN ${cashTransactions.transactionType} = 'DEBIT' THEN CAST(${cashTransactions.amount} AS REAL) ELSE -CAST(${cashTransactions.amount} AS REAL) END), 0)`,
      })
      .from(cashTransactions)
      .where(and(eq(cashTransactions.accountId, cash.id), lte(cashTransactions.transactionDate, asOf)))
      .all();
    const cashBalanceRaw = parseAmount(cash.openingBalance || "0") + parseAmount(cashMovement?.movement || "0");

    const bankBalanceRaw = await this.sumLedgerBalancesAsOf(asOfDate, "bank", "DEBIT");
    const receivablesRaw = await this.sumLedgerBalancesAsOf(asOfDate, "customer", "DEBIT");
    const payablesRaw = await this.sumLedgerBalancesAsOf(asOfDate, "supplier", "CREDIT");
    const employeePayablesRaw = await this.sumLedgerBalancesAsOf(asOfDate, "employee", "CREDIT");

    const stockReport = await this.getStockReport({ toDate: asOfDate });
    const inventoryValueRaw = stockReport.totals.closingValue ? parseAmount(stockReport.totals.closingValue) : 0;

    const retainedEarningsRaw = parseAmount((await this.getIncomeStatement(new Date(0), asOfDate)).netProfit);
    const capitalAccount = await this.ensureSystemAccount(db, "Capital", "equity");

    const [capMovements] = db
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'credit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, capitalAccount.id), lte(ledgerEntries.entryDate, asOf)))
      .all();
    const capitalBalanceRaw =
      parseAmount(capitalAccount.openingBalance || "0") + parseAmount(capMovements?.total || "0");

    const toCents = (value: number) => Math.round(value * 100);
    const fromCents = (value: number) => (value / 100).toFixed(2);

    const cashCents = toCents(cashBalanceRaw);
    const bankCents = toCents(bankBalanceRaw);
    const receivablesCents = toCents(receivablesRaw);
    const inventoryCents = toCents(inventoryValueRaw);
    const payablesCents = toCents(payablesRaw);
    const employeePayablesCents = toCents(employeePayablesRaw);
    const capitalCents = toCents(capitalBalanceRaw);
    const retainedCents = toCents(retainedEarningsRaw);

    const assetsTotalCents = cashCents + bankCents + receivablesCents + inventoryCents;
    const liabilitiesTotalCents = payablesCents + employeePayablesCents;
    const equityTotalCents = capitalCents + retainedCents;

    const validation = computeBalanceSheetValidation(fromCents(assetsTotalCents), fromCents(liabilitiesTotalCents + equityTotalCents));

    return {
      asOfDate,
      assets: {
        cash: fromCents(cashCents),
        bank: fromCents(bankCents),
        receivables: fromCents(receivablesCents),
        inventory: fromCents(inventoryCents),
        total: fromCents(assetsTotalCents),
      },
      liabilities: {
        payables: fromCents(payablesCents),
        expensesPayable: fromCents(employeePayablesCents),
        total: fromCents(liabilitiesTotalCents),
      },
      equity: {
        capital: fromCents(capitalCents),
        retainedEarnings: fromCents(retainedCents),
        total: fromCents(equityTotalCents),
      },
      totals: {
        assets: fromCents(assetsTotalCents),
        liabilitiesAndEquity: fromCents(liabilitiesTotalCents + equityTotalCents),
      },
      validation: { balanced: validation.balanced, difference: validation.difference },
    };
  }

  async getCapitalStatement(startDate: Date, endDate: Date) {
    const capital = await this.ensureSystemAccount(db, "Capital", "equity");
    const drawings = await this.ensureSystemAccount(db, "Drawings", "equity");

    const from = startDate;
    const to = endOfDay(endDate);

    const [capBefore] = db
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'credit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, capital.id), lt(ledgerEntries.entryDate, from)))
      .all();
    const openingCapital = parseAmount(capital.openingBalance || "0") + parseAmount(capBefore?.total || "0");

    const [capDuring] = db
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'credit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, capital.id), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
      .all();
    const additionalCapital = parseAmount(capDuring?.total || "0");

    const [drawDuring] = db
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, drawings.id), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
      .all();
    const drawingsAmount = Math.max(parseAmount(drawDuring?.total || "0"), 0);

    const netProfit = parseAmount((await this.getProfitLoss(startDate, endDate)).netProfit);
    const closingCapital = openingCapital + additionalCapital + netProfit - drawingsAmount;

    return {
      openingCapital: openingCapital.toString(),
      additionalCapital: additionalCapital.toString(),
      drawings: drawingsAmount.toString(),
      netProfit: netProfit.toString(),
      closingCapital: closingCapital.toString(),
    };
  }

  async getSalaryAccount(startDate: Date, endDate: Date) {
    const from = startDate;
    const to = endOfDay(endDate);

    const rows = db
      .select({
        payrollMonth: payrolls.payrollMonth,
        basicSalary: payrolls.basicSalary,
        allowances: payrolls.allowances,
        deductions: payrolls.deductions,
        netSalary: payrolls.netSalary,
        paymentStatus: payrolls.paymentStatus,
        employeeName: employees.name,
        accountId: employees.accountId,
      })
      .from(payrolls)
      .leftJoin(employees, eq(payrolls.employeeId, employees.id))
      .where(and(gte(payrolls.createdAt, from), lte(payrolls.createdAt, to)))
      .orderBy(payrolls.payrollMonth)
      .all();

    const mapped = rows.map((r) => {
      const net = parseAmount(r.netSalary || "0");
      const paid = r.paymentStatus === "Paid" ? net : 0;
      const balance = Math.max(net - paid, 0);
      return {
        accountId: r.accountId ?? null,
        employee: r.employeeName || "Employee",
        salaryMonth: r.payrollMonth,
        basicSalary: parseAmount(r.basicSalary || "0").toString(),
        allowances: parseAmount(r.allowances || "0").toString(),
        deductions: parseAmount(r.deductions || "0").toString(),
        netSalary: net.toString(),
        paidAmount: paid.toString(),
        balanceAmount: balance.toString(),
      };
    });

    const totals = mapped.reduce(
      (acc, r) => {
        acc.basicSalary += parseAmount(r.basicSalary);
        acc.allowances += parseAmount(r.allowances);
        acc.deductions += parseAmount(r.deductions);
        acc.netSalary += parseAmount(r.netSalary);
        acc.paidAmount += parseAmount(r.paidAmount);
        acc.balanceAmount += parseAmount(r.balanceAmount);
        return acc;
      },
      { basicSalary: 0, allowances: 0, deductions: 0, netSalary: 0, paidAmount: 0, balanceAmount: 0 },
    );

    return {
      rows: mapped,
      totals: {
        basicSalary: totals.basicSalary.toString(),
        allowances: totals.allowances.toString(),
        deductions: totals.deductions.toString(),
        netSalary: totals.netSalary.toString(),
        paidAmount: totals.paidAmount.toString(),
        balanceAmount: totals.balanceAmount.toString(),
      },
    };
  }

  async getReportDetail(referenceType: string, referenceId: number) {
    const type = (referenceType || "").toLowerCase();

      if (type === "sale") {
        const sale = await this.getSale(referenceId);
        if (!sale) return null;
        const items = await this.getSaleItems(referenceId);
        const customer = await this.getAccount(sale.customerId);
        const saleProductIds = Array.from(new Set(items.map((item) => item.productId)));
        const saleProducts = saleProductIds.length
          ? db.select().from(products).where(inArray(products.id, saleProductIds)).all()
          : [];
        const saleProductMap = new Map(saleProducts.map((p) => [p.id, p]));
        const formatQty = (value: number) =>
          value.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        const buildItemSummary = (entries: SaleItem[]) => {
          if (!entries.length) return "";
          const totals = new Map<number, number>();
          for (const item of entries) {
            const qty = parseAmount(item.quantity);
            totals.set(item.productId, (totals.get(item.productId) || 0) + qty);
          }
          const parts: string[] = [];
          const entriesList = Array.from(totals.entries());
          for (let idx = 0; idx < entriesList.length; idx += 1) {
            if (idx >= 2) break;
            const [productId, qty] = entriesList[idx];
            const product = saleProductMap.get(productId);
            const unit = product?.unit || "units";
            parts.push(`${product?.name || `#${productId}`} ${formatQty(qty)} ${unit}`);
          }
          if (entriesList.length > 2) parts.push(`+${entriesList.length - 2} more`);
          return parts.join(", ");
        };
        const saleChargeLines = [
          { label: "Loading", amount: parseAmount(sale.loadingCharges || "0") },
          { label: "Weighing", amount: parseAmount(sale.weighingCharges || "0") },
          { label: "Other", amount: parseAmount(sale.otherCharges || "0") },
        ]
          .filter((line) => line.amount !== 0)
          .map((line) => `${line.label}${line.amount < 0 ? " (less)" : ""} ${formatQty(Math.abs(line.amount))}`);
        const saleNarration = [
          `Sale Invoice #${sale.invoiceNumber || sale.id}`,
          buildItemSummary(items),
          ...saleChargeLines,
        ].filter(Boolean).join(" | ");
        const ledger = db
          .select({
            id: ledgerEntries.id,
            entryDate: ledgerEntries.entryDate,
            transactionType: ledgerEntries.transactionType,
            amount: ledgerEntries.amount,
            description: ledgerEntries.description,
            referenceType: ledgerEntries.referenceType,
            referenceId: ledgerEntries.referenceId,
            accountId: ledgerEntries.accountId,
            accountName: accounts.name,
          })
          .from(ledgerEntries)
          .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
          .where(and(eq(ledgerEntries.referenceType, "sale"), eq(ledgerEntries.referenceId, referenceId)))
          .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
          .all()
          .map((le) => ({
            ...le,
            description: saleNarration || le.description,
            debit: le.transactionType === "debit" ? le.amount : "0",
            credit: le.transactionType === "credit" ? le.amount : "0",
          }));
        return { type: "sale", sale, items, customer, ledgerEntries: ledger };
      }

      if (type === "purchase") {
        const purchase = await this.getPurchaseWithDetails(referenceId);
        if (!purchase) return null;
        const supplier = await this.getAccount(purchase.supplierId);
        const purchaseItems = purchase.items || [];
        const purchaseChargesList = purchase.charges || [];
        const purchaseProductIds = Array.from(new Set(purchaseItems.map((item) => item.productId)));
        const purchaseProducts = purchaseProductIds.length
          ? db.select().from(products).where(inArray(products.id, purchaseProductIds)).all()
          : [];
        const purchaseProductMap = new Map(purchaseProducts.map((p) => [p.id, p]));
        const formatQty = (value: number) =>
          value.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        const purchaseChargeLabel = (type: string) => {
          switch (type) {
            case "weight":
              return "Weight";
            case "freight":
              return "Freight";
            case "loading_filling":
              return "Loading";
            case "market_fee":
              return "Market Fee";
            case "mitha_sukri":
              return "Mitha Sukri";
            case "phone_analysis":
              return "Phone Analysis";
            case "brokerage":
              return "Brokerage";
            case "commission":
              return "Commission";
            case "bardana":
              return "Bardana";
            case "broken_allowance":
              return "Broken Allowance";
            case "other":
            default:
              return "Other";
          }
        };
        const buildItemSummary = (entries: PurchaseItem[]) => {
          if (!entries.length) return "";
          const totals = new Map<number, number>();
          for (const item of entries) {
            const qty = parseAmount(item.netWeightKg);
            totals.set(item.productId, (totals.get(item.productId) || 0) + qty);
          }
          const parts: string[] = [];
          const entriesList = Array.from(totals.entries());
          for (let idx = 0; idx < entriesList.length; idx += 1) {
            if (idx >= 2) break;
            const [productId, qty] = entriesList[idx];
            const product = purchaseProductMap.get(productId);
            const mound = qty > 0 ? qty / 40 : 0;
            const qtyLabel = mound > 0 ? `${formatQty(mound)} mund` : `${formatQty(qty)} kg`;
            parts.push(`${product?.name || `#${productId}`} ${qtyLabel}`);
          }
          if (entriesList.length > 2) parts.push(`+${entriesList.length - 2} more`);
          return parts.join(", ");
        };
        const purchaseChargeLines = purchaseChargesList
          .map((charge) => ({
            label: purchaseChargeLabel(charge.type),
            amount: parseAmount(charge.amount),
            mode: charge.mode,
          }))
          .filter((c) => c.amount > 0)
          .map((c) => `${c.label}${c.mode === "less" ? " (less)" : ""} ${formatQty(c.amount)}`);
        const purchaseNarration = [
          `Purchase Invoice #${purchase.invoiceNumber || purchase.id}`,
          buildItemSummary(purchaseItems),
          ...purchaseChargeLines,
        ].filter(Boolean).join(" | ");
        const ledger = db
          .select({
            id: ledgerEntries.id,
            entryDate: ledgerEntries.entryDate,
            transactionType: ledgerEntries.transactionType,
            amount: ledgerEntries.amount,
            description: ledgerEntries.description,
            referenceType: ledgerEntries.referenceType,
            referenceId: ledgerEntries.referenceId,
            accountId: ledgerEntries.accountId,
            accountName: accounts.name,
          })
          .from(ledgerEntries)
          .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
          .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, referenceId)))
          .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
          .all()
          .map((le) => ({
            ...le,
            description: purchaseNarration || le.description,
            debit: le.transactionType === "debit" ? le.amount : "0",
            credit: le.transactionType === "credit" ? le.amount : "0",
          }));
        return { type: "purchase", purchase, supplier, ledgerEntries: ledger };
      }

      if (type === "expense") {
        const [expense] = db.select().from(expenseEntries).where(eq(expenseEntries.id, referenceId)).all();
        if (!expense) return null;
        const [expenseAccount] = db.select().from(accounts).where(eq(accounts.id, expense.expenseAccountId)).all();
        const [payFromAccount] = db.select().from(accounts).where(eq(accounts.id, expense.payFromAccountId)).all();
        const ledger = db
          .select({
            id: ledgerEntries.id,
            entryDate: ledgerEntries.entryDate,
            transactionType: ledgerEntries.transactionType,
            amount: ledgerEntries.amount,
            description: ledgerEntries.description,
            referenceType: ledgerEntries.referenceType,
            referenceId: ledgerEntries.referenceId,
            accountId: ledgerEntries.accountId,
            accountName: accounts.name,
          })
          .from(ledgerEntries)
          .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
          .where(and(eq(ledgerEntries.referenceType, "expense"), eq(ledgerEntries.referenceId, referenceId)))
          .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
          .all()
          .map((le) => ({
            ...le,
            debit: le.transactionType === "debit" ? le.amount : "0",
            credit: le.transactionType === "credit" ? le.amount : "0",
          }));
        return { type: "expense", expense, expenseAccount, payFromAccount, ledgerEntries: ledger };
      }

    if (type === "product") {
      const product = await this.getProduct(referenceId);
      if (!product) return null;
      const purchaseMovements =
        db
          .select({
            refNo: purchases.invoiceNumber,
            refId: purchases.id,
            direction: sql`'in'`.as("direction"),
            qty: purchaseItems.netWeightKg,
            date: purchases.purchaseDate,
            narration: purchases.notes,
          })
          .from(purchaseItems)
          .leftJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
          .where(and(eq(purchaseItems.productId, referenceId), isNull(purchaseItems.deletedAt), isNull(purchases.deletedAt)))
          .all() || [];
      const saleMovements =
        db
          .select({
            refNo: sales.invoiceNumber,
            refId: sales.id,
            direction: sql`'out'`.as("direction"),
            qty: saleItems.quantity,
            date: sales.saleDate,
            narration: sales.notes,
          })
          .from(saleItems)
          .leftJoin(sales, eq(saleItems.saleId, sales.id))
          .where(eq(saleItems.productId, referenceId))
          .all() || [];

      const processingOut =
        db
          .select({
            refNo: processing.batchNumber,
            refId: processing.id,
            direction: sql`'out'`.as("direction"),
            qty: processing.sourceQuantity,
            date: processing.startDate,
            narration: processing.notes,
          })
          .from(processing)
          .where(eq(processing.sourceProductId, referenceId))
          .all() || [];

      const processingIn =
        db
          .select({
            refNo: processing.batchNumber,
            refId: processing.id,
            direction: sql`'in'`.as("direction"),
            qty: processing.outputQuantity,
            date: processing.completedDate,
            narration: processing.notes,
          })
          .from(processing)
          .where(and(eq(processing.outputProductId, referenceId), sql`${processing.completedDate} IS NOT NULL`))
          .all() || [];

      const movements = [...purchaseMovements, ...saleMovements, ...processingOut, ...processingIn].sort(
        (a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime(),
      );

      return { type: "product", product, movements };
    }

    if (type === "account") {
      const account = await this.getAccount(referenceId);
      if (!account) return null;
      const ledger = (await this.getLedgerEntries(referenceId)).map((entry) => ({
        ...entry,
        accountName: account.name,
      }));
      return { type: "account", account, ledgerEntries: ledger };
    }

    if (type === "receipt" || type === "payment") {
      const voucher = await this.getReceiptVoucher(referenceId);
      if (!voucher) return null;
      const ledger = db
        .select({
          id: ledgerEntries.id,
          entryDate: ledgerEntries.entryDate,
          transactionType: ledgerEntries.transactionType,
          amount: ledgerEntries.amount,
          description: ledgerEntries.description,
          referenceType: ledgerEntries.referenceType,
          referenceId: ledgerEntries.referenceId,
          accountId: ledgerEntries.accountId,
          accountName: accounts.name,
        })
        .from(ledgerEntries)
        .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
        .where(and(eq(ledgerEntries.referenceType, type), eq(ledgerEntries.referenceId, referenceId)))
        .orderBy(ledgerEntries.entryDate)
        .all()
        .map((le) => ({
          ...le,
          debit: le.transactionType === "debit" ? le.amount : "0",
          credit: le.transactionType === "credit" ? le.amount : "0",
        }));
      return { type, voucher, ledgerEntries: ledger };
    }

    if (type === "journal_voucher") {
      const voucher = await this.getJournalVoucher(referenceId);
      if (!voucher) return null;
      const ledger = db
        .select({
          id: ledgerEntries.id,
          entryDate: ledgerEntries.entryDate,
          transactionType: ledgerEntries.transactionType,
          amount: ledgerEntries.amount,
          description: ledgerEntries.description,
          referenceType: ledgerEntries.referenceType,
          referenceId: ledgerEntries.referenceId,
          accountId: ledgerEntries.accountId,
          accountName: accounts.name,
        })
        .from(ledgerEntries)
        .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
        .where(and(eq(ledgerEntries.referenceType, "journal_voucher"), eq(ledgerEntries.referenceId, referenceId)))
        .orderBy(ledgerEntries.entryDate)
        .all()
        .map((le) => ({
          ...le,
          debit: le.transactionType === "debit" ? le.amount : "0",
          credit: le.transactionType === "credit" ? le.amount : "0",
        }));
      return { type: "journal_voucher", voucher, ledgerEntries: ledger };
    }

    return null;
  }

  async getPeriodLocks(): Promise<PeriodLock[]> {
    return db.select().from(periodLocks).orderBy(desc(periodLocks.id)).all();
  }

  async createPeriodLock(lock: InsertPeriodLock): Promise<PeriodLock> {
    const [created] = await db.insert(periodLocks).values(lock as any).returning();
    return created;
  }

  async deletePeriodLock(id: number): Promise<boolean> {
    const result = await db.delete(periodLocks).where(eq(periodLocks.id, id)).run();
    return result.changes > 0;
  }
}

export const storage = new DatabaseStorage();
