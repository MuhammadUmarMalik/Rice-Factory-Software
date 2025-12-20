import { db } from "./db";
import { eq, and, desc, sql, gte, lte, lt, isNull, inArray, or } from "drizzle-orm";
import {
  users, accounts, products, purchases, purchaseItems, purchaseCharges,
  processing, sales, saleItems, ledgerEntries,
  type User, type InsertUser, type Account, type InsertAccount,
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

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;

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

  // Accounts
  getAccounts(type?: string): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;

  // Products
  getProducts(): Promise<Product[]>;
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
  getNextSaleInvoiceNumber(): Promise<string>;
  getNextGatePassNumber(): Promise<string>;

  // Sale Items
  getSaleItems(saleId: number): Promise<SaleItem[]>;

  // Ledger
  getLedgerEntries(accountId?: number, referenceType?: string, startDate?: Date, endDate?: Date): Promise<LedgerEntry[]>;
  createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry>;
  getOrCreateCashAccount(): Promise<Account>;
  recordCashTransaction(tx: CashTxInput): Promise<CashTransaction>;
  getCashSummary(): Promise<{ opening: number; debit: number; credit: number; closing: number }>;
  getCashTransactions(): Promise<CashTransaction[]>;

  // Reports
  getStockReport(): Promise<{ product: Product; totalPurchased: string; totalSold: string; currentStock: string }[]>;
  getTrialBalance(): Promise<{ account: Account; debit: string; credit: string }[]>;
  getProfitLoss(startDate?: Date, endDate?: Date): Promise<{
    totalPurchases: string;
    totalSales: string;
    expenses: string;
    grossProfit: string;
    netProfit: string;
    purchaseCount: number;
    saleCount: number;
  }>;

  // New Accounting Reports (derived, no duplicate data)
  getPeriodPurchases(startDate: Date, endDate: Date, supplierId?: number): Promise<{
    rows: Array<{
      id: number;
      purchaseDate: Date;
      supplierId: number;
      supplierName: string;
      purchaseAmount: string;
      tax: string;
      netAmount: string;
      invoiceNumber: string;
    }>;
    totals: { purchaseAmount: string; tax: string; netAmount: string };
  }>;
  getPeriodSales(startDate: Date, endDate: Date, customerId?: number): Promise<{
    rows: Array<{
      id: number;
      saleDate: Date;
      customerId: number;
      customerName: string;
      salesAmount: string;
      tax: string;
      netAmount: string;
      invoiceNumber: string;
    }>;
    totals: { salesAmount: string; tax: string; netAmount: string };
  }>;
  getGrossProfit(startDate: Date, endDate: Date): Promise<{
    totalSales: string;
    costOfGoodsSold: string;
    grossProfit: string;
    rows?: Array<{ saleId: number; invoiceNumber: string; saleDate: Date; salesAmount: string; costOfGoodsSold: string; grossProfit: string }>;
  }>;
  getDayBook(startDate: Date, endDate: Date): Promise<{
    openingBalance: string;
    rows: Array<{
      date: Date;
      openingBalance: string;
      voucherType: string;
      voucherNo: string;
      debit: string;
      credit: string;
      closingBalance: string;
      referenceType?: string | null;
      referenceId?: number | null;
      narration?: string | null;
    }>;
    closingBalance: string;
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
    }>;
    totals: { invoiceAmount: string; receivedAmount: string; outstandingAmount: string };
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
    }>;
    totals: { billAmount: string; paidAmount: string; outstandingAmount: string };
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
  }>;
  getCapitalStatement(startDate: Date, endDate: Date): Promise<{
    openingCapital: string;
    additionalCapital: string;
    drawings: string;
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
    }>;
    totals: { netSalary: string };
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

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.fullName).all();
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
  async getAccounts(type?: string): Promise<Account[]> {
    if (type) {
      return db.select().from(accounts)
        .where(eq(accounts.type, type as any))
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
    const [updated] = await db.update(accounts).set(account).where(eq(accounts.id, id)).returning();
    return updated;
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

  private ensureFiscalCalendarInitialized(client: DbClient, performedBy?: { userId?: number }) {
    const existing = client.select().from(fiscalYears).all();
    if (existing.length > 0) return;

    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    const fy = client.insert(fiscalYears).values({
      name: `FY-${year}`,
      startDate: start,
      endDate: end,
      status: "open",
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
        isClosed: false as any,
      } as any).run();
    }

    const allAccounts = client.select().from(accounts).all();
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
    this.assertPeriodNotLocked(client, postingDate, context);
    this.assertFiscalPeriodOpen(client, postingDate, context);
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(products.name).all();
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
    const result = await db.delete(products).where(eq(products.id, id)).run();
    return result.changes > 0;
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
    const moundQtyFloat = netWeightKg / moundBaseKg;
    const moundQty = Math.floor(moundQtyFloat);
    const moundRemainderKg = Math.max(netWeightKg - (moundQty * moundBaseKg), 0);

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

      const totalMoundQtyFloat = totalNetWeightKg / moundBaseKg;
      const totalMoundQty = Math.floor(totalMoundQtyFloat);
      const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundQty * moundBaseKg), 0);

      const { add: chargesAdd, less: chargesLess } = this.sumCharges(charges);
      const brokerCommissionPercent = parseAmount(purchase.brokerCommissionPercent || "0");
      const brokerCommission = (subtotal * brokerCommissionPercent) / 100;

      const lineSubtotal = subtotal + brokerCommission;
      const taxAmount = parseAmount((purchase as any).taxAmount || 0);
      const grandAmount = lineSubtotal + chargesAdd - chargesLess + taxAmount;
      const paidAmount = parseAmount((purchase as any).paidAmount || 0);
      const balanceDue = grandAmount - paidAmount;
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

      // Double-entry: Dr Inventory/Expense (+Tax Input if any), Cr Supplier (AP)
      const debitAccountId = purchase.expenseAccountId ?? this.ensureSystemAccount(client, "Inventory", "asset").id;
      const supplierAccountId = purchase.supplierId;
      const baseAmount = Math.max(grandAmount - taxAmount, 0);

      if (baseAmount > 0) {
        this.postLedgerEntry(client, {
          accountId: debitAccountId,
          transactionType: "debit",
          amount: baseAmount.toString(),
          description: `Purchase Invoice ${invoiceNumber}`,
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
        this.postLedgerEntry(client, {
          accountId: taxAccountId,
          transactionType: "debit",
          amount: taxAmount.toString(),
          description: `Purchase Tax ${invoiceNumber}`,
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

      this.postLedgerEntry(client, {
        accountId: supplierAccountId,
        transactionType: "credit",
        amount: grandAmount.toString(),
        description: `Purchase Invoice ${invoiceNumber}`,
        referenceType: "purchase",
        referenceId: newPurchase.id,
        entryDate: postingDate,
      });

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

      // Reverse prior ledger impact (post reversing entries for balance integrity)
      const priorEntries = tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, id)))
        .all();
      for (const le of priorEntries) {
        this.postLedgerEntry(client, {
          accountId: le.accountId,
          transactionType: le.transactionType === "debit" ? "credit" : "debit",
          amount: le.amount,
          description: `Reversal Purchase ${existing.invoiceNumber}`,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
      }

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

      const totalMoundQtyFloat = totalNetWeightKg / moundBaseKg;
      const totalMoundQty = Math.floor(totalMoundQtyFloat);
      const totalMoundRemainderKg = Math.max(totalNetWeightKg - (totalMoundQty * moundBaseKg), 0);

      const { add: chargesAdd, less: chargesLess } = this.sumCharges(charges);
      const brokerCommissionPercent = parseAmount((purchase as any).brokerCommissionPercent ?? existing.brokerCommissionPercent ?? "0");
      const brokerCommission = (subtotal * brokerCommissionPercent) / 100;

      const lineSubtotal = subtotal + brokerCommission;
      const taxAmount = parseAmount((purchase as any).taxAmount ?? existing.taxAmount ?? 0);
      const grandAmount = lineSubtotal + chargesAdd - chargesLess + taxAmount;
      const paidAmount = parseAmount((purchase as any).paidAmount ?? existing.paidAmount ?? 0);
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

      // Post fresh double-entry for updated purchase
      const debitAccountId = purchase.expenseAccountId ?? existing.expenseAccountId ?? this.ensureSystemAccount(client, "Inventory", "asset").id;
      const supplierAccountId = purchase.supplierId ?? existing.supplierId;
      const baseAmount = Math.max(grandAmount - taxAmount, 0);

      if (baseAmount > 0) {
        this.postLedgerEntry(client, {
          accountId: debitAccountId,
          transactionType: "debit",
          amount: baseAmount.toString(),
          description: `Purchase Update ${existing.invoiceNumber}`,
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
        this.postLedgerEntry(client, {
          accountId: taxAccountId,
          transactionType: "debit",
          amount: taxAmount.toString(),
          description: `Purchase Tax ${existing.invoiceNumber}`,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
      }

      this.postLedgerEntry(client, {
        accountId: supplierAccountId,
        transactionType: "credit",
        amount: grandAmount.toString(),
        description: `Purchase Update ${existing.invoiceNumber}`,
        referenceType: "purchase",
        referenceId: id,
        entryDate: postingDate,
      });

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

      // Reverse prior ledger impact and soft delete ledger rows
      const priorEntries = tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, id), isNull(ledgerEntries.deletedAt)))
        .all();
      for (const le of priorEntries) {
        this.postLedgerEntry(client, {
          accountId: le.accountId,
          transactionType: le.transactionType === "debit" ? "credit" : "debit",
          amount: le.amount,
          description: `Reversal Purchase ${existing.invoiceNumber}`,
          referenceType: "purchase",
          referenceId: id,
          entryDate: postingDate,
        });
        tx.update(ledgerEntries)
          .set({ deletedAt: new Date(), deletedBy })
          .where(eq(ledgerEntries.id, le.id))
          .run();
      }

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

      const charges = parseAmount(sale.loadingCharges || "0") +
                     parseAmount(sale.weighingCharges || "0") +
                     parseAmount(sale.otherCharges || "0");
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

      // Double-entry: Dr Customer (AR), Cr Revenue (+ tax output), record COGS/Inventory
      this.postLedgerEntry(client, {
        accountId: sale.customerId,
        transactionType: "debit",
        amount: totalAmount.toString(),
        description: `Sale Invoice ${invoiceNumber}`,
        referenceType: "sale",
        referenceId: newSale.id,
        entryDate: postingDate,
      });

      const revenueAccount = this.ensureSystemAccount(client, "Sales Revenue", "income");
      const baseRevenue = Math.max(totalAmount - taxAmount, 0);
      if (baseRevenue > 0) {
        this.postLedgerEntry(client, {
          accountId: revenueAccount.id,
          transactionType: "credit",
          amount: baseRevenue.toString(),
          description: `Sale Revenue ${invoiceNumber}`,
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
        this.postLedgerEntry(client, {
          accountId: taxAccountId,
          transactionType: "credit",
          amount: taxAmount.toString(),
          description: `Sales Tax ${invoiceNumber}`,
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

  // Sale Items
  async getSaleItems(saleId: number): Promise<SaleItem[]> {
    return db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  }

  // Ledger
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
      ? db.select().from(ledgerEntries).where(and(...whereClauses as any)).orderBy(ledgerEntries.entryDate).all()
      : db.select().from(ledgerEntries).orderBy(ledgerEntries.entryDate).all();

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
      const amount = parseAmount(row.amount);
      const isIncrease =
        normalSide === "DEBIT" ? row.transactionType === "debit" : row.transactionType === "credit";
      running = isIncrease ? running + amount : running - amount;
      return {
        ...row,
        openingBalance: opening.toString(),
        debit: row.transactionType === "debit" ? row.amount : "0",
        credit: row.transactionType === "credit" ? row.amount : "0",
        runningBalance: running.toString(),
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

      const voucherType = (data.voucherType || "CR").toUpperCase();
      const settlementAccount =
        data.settlementAccountId ||
        (voucherType === "CR" ? this.ensureCashAccountInternal(client).id : this.ensureSystemAccount(client, "Cash in Hand", "asset").id);

      const cleanLines = (lines || []).map((line) => {
        const amt = parseAmount((line.debit || line.credit || "0") ?? "0").toString();
        return {
          ...line,
          debit: voucherType === "DR" ? amt : "0",
          credit: voucherType === "CR" ? amt : "0",
        };
      });

      const total = cleanLines.reduce((sum, l) => sum + parseAmount(l.debit || l.credit || "0"), 0);
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

      const voucherType = (data.voucherType || existing.voucherType || "CR").toUpperCase();
      const settlementAccount =
        data.settlementAccountId ||
        existing.settlementAccountId ||
        (voucherType === "CR" ? this.ensureCashAccountInternal(client).id : this.ensureSystemAccount(client, "Cash in Hand", "asset").id);

      const cleanLines = (lines || []).map((line) => {
        const amt = parseAmount((line.debit || line.credit || "0") ?? "0").toString();
        return {
          ...line,
          debit: voucherType === "DR" ? amt : "0",
          credit: voucherType === "CR" ? amt : "0",
        };
      });

      const total = cleanLines.reduce((sum, l) => sum + parseAmount(l.debit || l.credit || "0"), 0);
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
      for (const line of existing.lines) {
        const debit = parseAmount(line.debit);
        const credit = parseAmount(line.credit);
        if (debit > 0) {
          this.postLedgerEntry(client, {
            accountId: line.accountId,
            transactionType: "credit",
            amount: debit.toString(),
            description: `Reversal of voucher ${existing.voucherNumber}`,
            referenceType: existing.voucherType === "CR" ? "receipt" : "payment",
            referenceId: id,
            entryDate: new Date(),
          });
        }
        if (credit > 0) {
          this.postLedgerEntry(client, {
            accountId: line.accountId,
            transactionType: "debit",
            amount: credit.toString(),
            description: `Reversal of voucher ${existing.voucherNumber}`,
            referenceType: existing.voucherType === "CR" ? "receipt" : "payment",
            referenceId: id,
            entryDate: new Date(),
          });
        }
      }
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
  async getStockReport(): Promise<{ product: Product; totalPurchased: string; totalSold: string; currentStock: string }[]> {
    const allProducts = await this.getProducts();
    const result = [];

    for (const product of allProducts) {
      const [purchasedResult] = db.select({
        total: sql<string>`COALESCE(SUM(${purchaseItems.netWeightKg}), 0)`
      })
        .from(purchaseItems)
        .leftJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
        .where(and(eq(purchaseItems.productId, product.id), isNull(purchaseItems.deletedAt), isNull(purchases.deletedAt)))
        .all();

      const [soldResult] = db.select({
        total: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`
      }).from(saleItems).where(eq(saleItems.productId, product.id)).all();

      result.push({
        product,
        totalPurchased: purchasedResult?.total || "0",
        totalSold: soldResult?.total || "0",
        currentStock: product.currentStock,
      });
    }

    return result;
  }

  async getTrialBalance(): Promise<{ account: Account; debit: string; credit: string }[]> {
    const allAccounts = await this.getAccounts();
    const result = [];

    for (const account of allAccounts) {
      const normal = normalSideForAccountType(account.type);
      const [movementRow] = db
        .select({ total: ledgerSumByNormal(normal) })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.accountId, account.id))
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

    return result;
  }

  async getProfitLoss(startDate?: Date, endDate?: Date): Promise<{
    totalPurchases: string;
    totalSales: string;
    expenses: string;
    grossProfit: string;
    netProfit: string;
    purchaseCount: number;
    saleCount: number;
  }> {
    const from = startDate ?? new Date(0);
    const to = endDate ? endOfDay(endDate) : new Date();

    const purchaseConditions = [];
    if (from) purchaseConditions.push(gte(purchases.purchaseDate, from));
    if (to) purchaseConditions.push(lte(purchases.purchaseDate, to));

    const purchaseQuery = db.select({
      total: sql<string>`COALESCE(SUM(${purchases.totalAmount}), 0)`,
      count: sql<number>`COUNT(*)`
    }).from(purchases);
    const [purchaseTotal] = (purchaseConditions.length
      ? purchaseQuery.where(and(...purchaseConditions))
      : purchaseQuery
    ).all();

    const saleConditions = [];
    if (from) saleConditions.push(gte(sales.saleDate, from));
    if (to) saleConditions.push(lte(sales.saleDate, to));

    const saleQuery = db.select({
      total: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)`,
      count: sql<number>`COUNT(*)`
    }).from(sales);
    const [saleTotal] = (saleConditions.length
      ? saleQuery.where(and(...saleConditions))
      : saleQuery
    ).all();

    const gross = await this.getGrossProfit(from, to);
    const expenseTotal = await this.sumExpenseMovements(from, to);
    const netProfit = parseAmount(gross.grossProfit) - expenseTotal;

    return {
      totalPurchases: purchaseTotal?.total || "0",
      totalSales: gross.totalSales,
      expenses: expenseTotal.toString(),
      grossProfit: gross.grossProfit,
      netProfit: netProfit.toString(),
      purchaseCount: purchaseTotal?.count ?? 0,
      saleCount: saleTotal?.count ?? 0,
    };
  }

  async getPeriodPurchases(startDate: Date, endDate: Date, supplierId?: number) {
    const from = startDate;
    const to = endOfDay(endDate);
    const conditions = [gte(purchases.purchaseDate, from), lte(purchases.purchaseDate, to), isNull(purchases.deletedAt)];
    if (supplierId) conditions.push(eq(purchases.supplierId, supplierId));

    const baseRows = db
      .select({
        id: purchases.id,
        invoiceNumber: purchases.invoiceNumber,
        purchaseDate: purchases.purchaseDate,
        supplierId: purchases.supplierId,
        supplierName: accounts.name,
        purchaseAmount: purchases.subtotal,
        netAmount: purchases.totalAmount,
      })
      .from(purchases)
      .leftJoin(accounts, eq(purchases.supplierId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(purchases.purchaseDate))
      .all();

    const purchaseIds = baseRows.map((r) => r.id);
    const taxRows = purchaseIds.length
      ? db
          .select({
            purchaseId: purchaseCharges.purchaseId,
            tax: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseCharges.type} = 'market_fee' THEN CAST(${purchaseCharges.amount} AS REAL) ELSE 0 END), 0)`,
          })
          .from(purchaseCharges)
          .where(inArray(purchaseCharges.purchaseId, purchaseIds))
          .groupBy(purchaseCharges.purchaseId)
          .all()
      : [];
    const taxByPurchaseId = new Map(taxRows.map((r) => [r.purchaseId, r.tax]));

    let purchaseAmountTotal = 0;
    let taxTotal = 0;
    let netTotal = 0;

    const rows = baseRows.map((r) => {
      const tax = parseAmount(taxByPurchaseId.get(r.id) || "0");
      const purchaseAmount = parseAmount(r.purchaseAmount || "0");
      const netAmount = parseAmount(r.netAmount || "0");
      purchaseAmountTotal += purchaseAmount;
      taxTotal += tax;
      netTotal += netAmount;
      return {
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        purchaseDate: new Date(r.purchaseDate as any),
        supplierId: r.supplierId,
        supplierName: r.supplierName || "",
        purchaseAmount: purchaseAmount.toString(),
        tax: tax.toString(),
        netAmount: netAmount.toString(),
      };
    });

    return {
      rows,
      totals: {
        purchaseAmount: purchaseAmountTotal.toString(),
        tax: taxTotal.toString(),
        netAmount: netTotal.toString(),
      },
    };
  }

  async getPeriodSales(startDate: Date, endDate: Date, customerId?: number) {
    const from = startDate;
    const to = endOfDay(endDate);
    const conditions = [gte(sales.saleDate, from), lte(sales.saleDate, to)];
    if (customerId) conditions.push(eq(sales.customerId, customerId));

    const rows = db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        saleDate: sales.saleDate,
        customerId: sales.customerId,
        customerName: accounts.name,
        salesAmount: sales.subtotal,
        netAmount: sales.totalAmount,
        loading: sales.loadingCharges,
        weighing: sales.weighingCharges,
        other: sales.otherCharges,
      })
      .from(sales)
      .leftJoin(accounts, eq(sales.customerId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(sales.saleDate))
      .all()
      .map((r) => {
        const salesAmount = parseAmount(r.salesAmount || "0");
        const tax = parseAmount(r.loading || "0") + parseAmount(r.weighing || "0") + parseAmount(r.other || "0");
        const netAmount = parseAmount(r.netAmount || "0");
        return {
          id: r.id,
          invoiceNumber: r.invoiceNumber,
          saleDate: new Date(r.saleDate as any),
          customerId: r.customerId,
          customerName: r.customerName || "",
          salesAmount: salesAmount.toString(),
          tax: tax.toString(),
          netAmount: netAmount.toString(),
        };
      });

    const totals = rows.reduce(
      (acc, r) => {
        acc.salesAmount += parseAmount(r.salesAmount);
        acc.tax += parseAmount(r.tax);
        acc.netAmount += parseAmount(r.netAmount);
        return acc;
      },
      { salesAmount: 0, tax: 0, netAmount: 0 },
    );

    return {
      rows,
      totals: {
        salesAmount: totals.salesAmount.toString(),
        tax: totals.tax.toString(),
        netAmount: totals.netAmount.toString(),
      },
    };
  }

  async getGrossProfit(startDate: Date, endDate: Date) {
    const from = startDate;
    const to = endOfDay(endDate);

    const cogsSystemAccount = this.ensureSystemAccount(db, "Cost of Goods Sold", "cogs");
    const incomeAccounts = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.type, "income" as any)).all();
    const cogsAccounts = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.type, "cogs" as any))
      .all();
    const cogsAccountIds = [...new Set([cogsSystemAccount.id, ...cogsAccounts.map((a) => a.id)])];
    const incomeAccountIds = incomeAccounts.map((a) => a.id);

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
        totalAmount: sales.totalAmount,
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
      const salesAmount = parseAmount(s.totalAmount || "0");
      const cogs = parseAmount(cogsBySale.get(s.id) || "0");
      const profit = salesAmount - cogs;
      return {
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        saleDate: new Date(s.saleDate as any),
        salesAmount: salesAmount.toString(),
        costOfGoodsSold: cogs.toString(),
        grossProfit: profit.toString(),
      };
    });

    const totalSales = rows.reduce((sum, r) => sum + parseAmount(r.salesAmount), 0) || parseAmount(revenueRow?.total || "0");
    const costOfGoodsSold = rows.reduce((sum, r) => sum + parseAmount(r.costOfGoodsSold), 0) || parseAmount(cogsRow?.total || "0");
    const grossProfit = totalSales - costOfGoodsSold;

    return {
      totalSales: totalSales.toString(),
      costOfGoodsSold: costOfGoodsSold.toString(),
      grossProfit: grossProfit.toString(),
      rows,
    };
  }

  async getDayBook(startDate: Date, endDate: Date) {
    const cash = await this.ensureCashAccountInternal(db);
    const from = startDate;
    const to = endOfDay(endDate);

    const [movementBefore] = db
      .select({
        movement: sql<string>`COALESCE(SUM(CASE WHEN ${cashTransactions.transactionType} = 'DEBIT' THEN CAST(${cashTransactions.amount} AS REAL) ELSE -CAST(${cashTransactions.amount} AS REAL) END), 0)`,
      })
      .from(cashTransactions)
      .where(and(eq(cashTransactions.accountId, cash.id), lt(cashTransactions.transactionDate, from)))
      .all();

    const opening = parseAmount(cash.openingBalance || "0") + parseAmount(movementBefore?.movement || "0");

    const txs = db
      .select()
      .from(cashTransactions)
      .where(and(eq(cashTransactions.accountId, cash.id), gte(cashTransactions.transactionDate, from), lte(cashTransactions.transactionDate, to)))
      .orderBy(cashTransactions.transactionDate)
      .all();

    const purchaseIds = txs.filter((t) => t.referenceType === "purchase" && t.referenceId).map((t) => t.referenceId!) as number[];
    const saleIds = txs.filter((t) => t.referenceType === "sale" && t.referenceId).map((t) => t.referenceId!) as number[];
    const receiptIds = txs.filter((t) => t.referenceType === "receipt" && t.referenceId).map((t) => t.referenceId!) as number[];
    const journalIds = txs.filter((t) => t.referenceType === "journal_voucher" && t.referenceId).map((t) => t.referenceId!) as number[];

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
    const receiptById = new Map<number, { voucherNumber: string; voucherType: string }>(
      receiptIds.length
        ? db
            .select({ id: receiptVouchers.id, voucherNumber: receiptVouchers.voucherNumber, voucherType: receiptVouchers.voucherType })
            .from(receiptVouchers)
            .where(inArray(receiptVouchers.id, receiptIds))
            .all()
            .map((r) => [r.id, { voucherNumber: r.voucherNumber, voucherType: r.voucherType }])
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

    let running = opening;
    const rows = txs.map((t) => {
      const rowOpening = running;
      const amt = parseAmount(t.amount);
      if (t.transactionType === "DEBIT") running += amt;
      else running -= amt;

      let voucherType = t.referenceType || "";
      let voucherNo = `${t.referenceType || ""}#${t.referenceId || ""}`;

      if (t.referenceType === "purchase" && t.referenceId) {
        voucherType = "PUR";
        voucherNo = purchaseNoById.get(t.referenceId) || voucherNo;
      } else if (t.referenceType === "sale" && t.referenceId) {
        voucherType = "SAL";
        voucherNo = saleNoById.get(t.referenceId) || voucherNo;
      } else if (t.referenceType === "receipt" && t.referenceId) {
        const rv = receiptById.get(t.referenceId);
        voucherType = rv?.voucherType || "RCPT";
        voucherNo = rv?.voucherNumber || voucherNo;
      } else if (t.referenceType === "journal_voucher" && t.referenceId) {
        voucherType = "JV";
        voucherNo = journalNoById.get(t.referenceId) || voucherNo;
      }

      return {
        date: new Date(t.transactionDate as any),
        openingBalance: rowOpening.toString(),
        voucherType,
        voucherNo,
        debit: t.transactionType === "DEBIT" ? amt.toString() : "0",
        credit: t.transactionType === "CREDIT" ? amt.toString() : "0",
        closingBalance: running.toString(),
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        narration: t.narration,
      };
    });

    return {
      openingBalance: opening.toString(),
      rows,
      closingBalance: running.toString(),
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

    const customerIds = [...new Set(salesRows.map((r) => r.customerId).filter(Boolean) as number[])];
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
        rows.push({
          saleId: sale.saleId,
          invoiceNumber: sale.invoiceNumber,
          saleDate: new Date(sale.saleDate as any),
          customerId: sale.customerId,
          customerName: sale.customerName || "",
          invoiceAmount: invoice.toString(),
          receivedAmount: (invoice - outstanding).toString(),
          outstandingAmount: outstanding.toString(),
          dueDate: null,
        });
      }
    }

    const filteredRows = rows.filter((r) => parseAmount(r.outstandingAmount) > 0);

    const totals = filteredRows.reduce(
      (acc, r) => {
        acc.invoiceAmount += parseAmount(r.invoiceAmount);
        acc.receivedAmount += parseAmount(r.receivedAmount);
        acc.outstandingAmount += parseAmount(r.outstandingAmount);
        return acc;
      },
      { invoiceAmount: 0, receivedAmount: 0, outstandingAmount: 0 },
    );

    return {
      rows: filteredRows,
      totals: {
        invoiceAmount: totals.invoiceAmount.toString(),
        receivedAmount: totals.receivedAmount.toString(),
        outstandingAmount: totals.outstandingAmount.toString(),
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

    const supplierIds = [...new Set(purchasesRows.map((r) => r.supplierId).filter(Boolean) as number[])];
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
        rows.push({
          purchaseId: pur.purchaseId,
          invoiceNumber: pur.invoiceNumber,
          purchaseDate: new Date(pur.purchaseDate as any),
          supplierId: pur.supplierId,
          supplierName: pur.supplierName || "",
          billAmount: bill.toString(),
          paidAmount: (bill - outstanding).toString(),
          outstandingAmount: outstanding.toString(),
          dueDate: pur.dueDate ? new Date(pur.dueDate as any) : null,
        });
      }
    }

    const filteredRows = rows.filter((r) => parseAmount(r.outstandingAmount) > 0);

    const totals = filteredRows.reduce(
      (acc, r) => {
        acc.billAmount += parseAmount(r.billAmount);
        acc.paidAmount += parseAmount(r.paidAmount);
        acc.outstandingAmount += parseAmount(r.outstandingAmount);
        return acc;
      },
      { billAmount: 0, paidAmount: 0, outstandingAmount: 0 },
    );

    return {
      rows: filteredRows,
      totals: {
        billAmount: totals.billAmount.toString(),
        paidAmount: totals.paidAmount.toString(),
        outstandingAmount: totals.outstandingAmount.toString(),
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
    const gross = await this.getGrossProfit(startDate, endDate);
    const operatingExpenses = await this.sumExpenseMovements(startDate, endDate);
    const netProfit = parseAmount(gross.grossProfit) - operatingExpenses;

    const [revenueRow] = db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${sales.subtotal} AS REAL)), 0)`,
      })
      .from(sales)
      .where(and(gte(sales.saleDate, startDate), lte(sales.saleDate, endOfDay(endDate))))
      .all();

    return {
      period: { fromDate: startDate, toDate: endDate },
      revenue: parseAmount(revenueRow?.total || "0").toString(),
      costOfSales: gross.costOfGoodsSold,
      grossProfit: gross.grossProfit,
      operatingExpenses: operatingExpenses.toString(),
      netProfit: netProfit.toString(),
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
    const cashBalance = parseAmount(cash.openingBalance || "0") + parseAmount(cashMovement?.movement || "0");

    const bankBalance = await this.sumLedgerBalancesAsOf(asOfDate, "bank", "DEBIT");
    const receivables = await this.sumLedgerBalancesAsOf(asOfDate, "customer", "DEBIT");
    const payables = await this.sumLedgerBalancesAsOf(asOfDate, "supplier", "CREDIT");
    const employeePayables = await this.sumLedgerBalancesAsOf(asOfDate, "employee", "CREDIT");

    const purchased = db
      .select({
        productId: purchaseItems.productId,
        qty: sql<string>`COALESCE(SUM(CAST(${purchaseItems.netWeightKg} AS REAL)), 0)`,
      })
      .from(purchaseItems)
      .leftJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
      .where(lte(purchases.purchaseDate, asOf))
      .groupBy(purchaseItems.productId)
      .all();
    const sold = db
      .select({
        productId: saleItems.productId,
        qty: sql<string>`COALESCE(SUM(CAST(${saleItems.quantity} AS REAL)), 0)`,
      })
      .from(saleItems)
      .leftJoin(sales, eq(saleItems.saleId, sales.id))
      .where(lte(sales.saleDate, asOf))
      .groupBy(saleItems.productId)
      .all();

    const purchasedByProduct = new Map(purchased.map((r) => [r.productId, parseAmount(r.qty)]));
    const soldByProduct = new Map(sold.map((r) => [r.productId, parseAmount(r.qty)]));
    const allProducts = await this.getProducts();
    const inventoryValue = allProducts.reduce((sum, p) => {
      const inQty = (purchasedByProduct.get(p.id) || 0) - (soldByProduct.get(p.id) || 0);
      const price = parseAmount(p.avgPurchasePrice || "0");
      return sum + Math.max(inQty, 0) * price;
    }, 0);

    const retainedEarnings = parseAmount((await this.getIncomeStatement(new Date(0), asOfDate)).netProfit);
    const capitalAccount = await this.ensureSystemAccount(db, "Capital", "equity");

    const [capMovements] = db
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'credit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, capitalAccount.id), lte(ledgerEntries.entryDate, asOf)))
      .all();
    const capitalBalance = parseAmount(capitalAccount.openingBalance || "0") + parseAmount(capMovements?.total || "0");

    const assetsTotal = cashBalance + bankBalance + receivables + inventoryValue;
    const liabilitiesTotal = payables + employeePayables;
    const equityTotal = capitalBalance + retainedEarnings;

    return {
      asOfDate,
      assets: {
        cash: cashBalance.toString(),
        bank: bankBalance.toString(),
        receivables: receivables.toString(),
        inventory: inventoryValue.toString(),
        total: assetsTotal.toString(),
      },
      liabilities: {
        payables: payables.toString(),
        expensesPayable: employeePayables.toString(),
        total: liabilitiesTotal.toString(),
      },
      equity: {
        capital: capitalBalance.toString(),
        retainedEarnings: retainedEarnings.toString(),
        total: equityTotal.toString(),
      },
      totals: {
        assets: assetsTotal.toString(),
        liabilitiesAndEquity: (liabilitiesTotal + equityTotal).toString(),
      },
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

    const closingCapital = openingCapital + additionalCapital - drawingsAmount;

    return {
      openingCapital: openingCapital.toString(),
      additionalCapital: additionalCapital.toString(),
      drawings: drawingsAmount.toString(),
      closingCapital: closingCapital.toString(),
    };
  }

  async getSalaryAccount(startDate: Date, endDate: Date) {
    const from = startDate;
    const to = endOfDay(endDate);

    const salaryAccounts = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.type, "salary" as any)).all();
    const salaryAccountIds = salaryAccounts.map((a) => a.id);
    if (salaryAccountIds.length === 0) return { rows: [], totals: { netSalary: "0" } };

    const entries = db
      .select({
        entryDate: ledgerEntries.entryDate,
        amount: ledgerEntries.amount,
        description: ledgerEntries.description,
      })
      .from(ledgerEntries)
      .where(and(inArray(ledgerEntries.accountId, salaryAccountIds), gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)))
      .orderBy(ledgerEntries.entryDate)
      .all();

    const grouped = new Map<string, { employee: string; salaryMonth: string; net: number }>();
    for (const e of entries) {
      const dt = new Date(e.entryDate as any);
      const salaryMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const raw = (e.description || "").trim();
      const employee = raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : "Employee";
      const net = parseAmount(e.amount);
      const key = `${salaryMonth}||${employee}`;
      const prev = grouped.get(key) || { employee, salaryMonth, net: 0 };
      prev.net += net;
      grouped.set(key, prev);
    }

    const values: Array<{ employee: string; salaryMonth: string; net: number }> = [];
    grouped.forEach((v) => values.push(v));
    const primarySalaryAccountId = salaryAccountIds[0] ?? null;
    const rows = values.map((r) => ({
      accountId: primarySalaryAccountId,
      employee: r.employee,
      salaryMonth: r.salaryMonth,
      basicSalary: r.net.toString(),
      allowances: "0",
      deductions: "0",
      netSalary: r.net.toString(),
    }));

    const totalNet = rows.reduce((sum, r) => sum + parseAmount(r.netSalary), 0);
    return { rows, totals: { netSalary: totalNet.toString() } };
  }

  async getReportDetail(referenceType: string, referenceId: number) {
    const type = (referenceType || "").toLowerCase();

    if (type === "sale") {
      const sale = await this.getSale(referenceId);
      if (!sale) return null;
      const items = await this.getSaleItems(referenceId);
      const customer = await this.getAccount(sale.customerId);
      const ledger = db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "sale"), eq(ledgerEntries.referenceId, referenceId)))
        .orderBy(ledgerEntries.entryDate)
        .all()
        .map((le) => ({
          ...le,
          debit: le.transactionType === "debit" ? le.amount : "0",
          credit: le.transactionType === "credit" ? le.amount : "0",
        }));
      return { type: "sale", sale, items, customer, ledgerEntries: ledger };
    }

    if (type === "purchase") {
      const purchase = await this.getPurchaseWithDetails(referenceId);
      if (!purchase) return null;
      const supplier = await this.getAccount(purchase.supplierId);
      const ledger = db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.referenceType, "purchase"), eq(ledgerEntries.referenceId, referenceId)))
        .orderBy(ledgerEntries.entryDate)
        .all()
        .map((le) => ({
          ...le,
          debit: le.transactionType === "debit" ? le.amount : "0",
          credit: le.transactionType === "credit" ? le.amount : "0",
        }));
      return { type: "purchase", purchase, supplier, ledgerEntries: ledger };
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

      const movements = [...purchaseMovements, ...saleMovements].sort(
        (a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime(),
      );

      return { type: "product", product, movements };
    }

    if (type === "account") {
      const account = await this.getAccount(referenceId);
      if (!account) return null;
      const ledger = await this.getLedgerEntries(referenceId);
      return { type: "account", account, ledgerEntries: ledger };
    }

    if (type === "receipt" || type === "payment") {
      const voucher = await this.getReceiptVoucher(referenceId);
      if (!voucher) return null;
      const ledger = db
        .select()
        .from(ledgerEntries)
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
        .select()
        .from(ledgerEntries)
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
