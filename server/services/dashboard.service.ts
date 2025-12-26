import { format } from "date-fns";
import { storage } from "../models/storage";

type DashboardRange = { fromDate: Date; toDate: Date; fiscalYearId?: number };

function parseAmount(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return Number.isFinite(num) ? num : 0;
}

function startOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function resolveRange(params: Partial<DashboardRange>) {
  const now = new Date();
  const fiscalYears = await storage.getFiscalYears();
  let fromDate = params.fromDate ? startOfDay(params.fromDate) : startOfDay(now);
  let toDate = params.toDate ? endOfDay(params.toDate) : endOfDay(now);
  if (params.fiscalYearId && (!params.fromDate || !params.toDate)) {
    const fy = fiscalYears.find((f: any) => f.id === params.fiscalYearId);
    if (fy) {
      fromDate = startOfDay(new Date(fy.startDate));
      toDate = endOfDay(new Date(fy.endDate));
    }
  }
  return { fromDate, toDate, fiscalYears };
}

function classifyProduct(name: string) {
  const label = name.toLowerCase();
  if (label.includes("paddy") || label.includes("parboiled")) return "paddy";
  if (label.includes("broken")) return "broken";
  if (label.includes("bardana") || label.includes("bag")) return "bardana";
  return "rice";
}

function chargeBucket(name: string) {
  const value = name.toLowerCase();
  if (value.includes("freight")) return "freight";
  if (value.includes("loading") || value.includes("unloading") || value.includes("filling")) return "loading";
  if (value.includes("market fee") || value.includes("market")) return "marketFee";
  if (value.includes("brokerage") || value.includes("commission")) return "brokerage";
  if (value.includes("bardana")) return "bardana";
  if (value.includes("processing") || value.includes("hulling")) return "processing";
  return null;
}

export async function getDashboardSummary(params: Partial<DashboardRange>) {
  const { fromDate, toDate, fiscalYears } = await resolveRange(params);

  const [profitLoss, trialBalance, purchasesReport, salesReport] = await Promise.all([
    storage.getProfitLoss(fromDate, toDate),
    storage.getTrialBalance(toDate),
    storage.getPurchaseReport({ fromDate, toDate }),
    storage.getSalesReport({ fromDate, toDate }),
  ]);

  const stockReport = await storage.getStockReport({ fromDate, toDate });
  const products = await storage.getProducts();
  const accounts = await storage.getAccounts();

  const cashBankAccounts = accounts.filter((a) => {
    const name = (a.name || "").toLowerCase();
    const isCash = name.includes("cash");
    const isBank = name.includes("bank") || a.type === "bank";
    const isSystemCash = a.isSystemAccount && a.type === "asset";
    return isCash || isBank || isSystemCash;
  });

  const cashAccountIds = new Set(
    cashBankAccounts.filter((a) => (a.name || "").toLowerCase().includes("cash") || (a.isSystemAccount && a.type === "asset")).map((a) => a.id),
  );
  const bankAccountIds = new Set(
    cashBankAccounts.filter((a) => (a.name || "").toLowerCase().includes("bank") || a.type === "bank").map((a) => a.id),
  );

  const ledgerToDate = await storage.getLedgerEntries(undefined, undefined, undefined, toDate);
  let cashBalance = 0;
  let bankBalance = 0;
  for (const entry of ledgerToDate) {
    const amount = parseAmount(entry.amount);
    if (cashAccountIds.has(entry.accountId)) {
      cashBalance += entry.transactionType === "debit" ? amount : -amount;
    }
    if (bankAccountIds.has(entry.accountId)) {
      bankBalance += entry.transactionType === "debit" ? amount : -amount;
    }
  }

  const ledgerInRange = await storage.getLedgerEntries(undefined, undefined, fromDate, toDate);
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const charges = {
    freight: 0,
    loading: 0,
    marketFee: 0,
    brokerage: 0,
    bardana: 0,
    processing: 0,
  };
  for (const entry of ledgerInRange) {
    if (entry.transactionType !== "debit") continue;
    const name = accountNameById.get(entry.accountId) || "";
    const bucket = chargeBucket(name);
    if (!bucket) continue;
    charges[bucket] += parseAmount(entry.amount);
  }

  const stockTotals = {
    paddy: 0,
    rice: 0,
    broken: 0,
    bardana: 0,
  };
  for (const product of products) {
    const qty = parseAmount(product.currentStock || "0");
    const category = classifyProduct(product.name || "");
    if (category === "paddy") stockTotals.paddy += qty;
    else if (category === "broken") stockTotals.broken += qty;
    else if (category === "bardana") stockTotals.bardana += qty;
    else stockTotals.rice += qty;
  }

  const bardanaRows = stockReport.rows.filter((row) => classifyProduct(row.itemName || row.itemName) === "bardana");
  const bardanaIn = bardanaRows.reduce((sum, r) => sum + parseAmount(r.inQty), 0);
  const bardanaOut = bardanaRows.reduce((sum, r) => sum + parseAmount(r.outQty), 0);
  const bardanaBalance = bardanaRows.reduce((sum, r) => sum + parseAmount(r.closingQty), 0);

  const lowStock = products
    .filter((p) => parseAmount(p.currentStock || "0") <= 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      stock: parseAmount(p.currentStock || "0"),
      unit: p.unit,
    }))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8);

  const outstandingCustomers = await storage.getOutstandingCustomers(toDate);
  const outstandingSuppliers = await storage.getOutstandingSuppliers(toDate);

  const dayBook = await storage.getDayBook(toDate);

  return {
    filters: {
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
      fiscalYearId: params.fiscalYearId ?? null,
    },
    fiscalYears,
    kpis: {
      totalPurchases: parseAmount(purchasesReport.totals.total),
      totalSales: parseAmount(salesReport.totals.total),
      stockValue: parseAmount(stockReport.totals.closingValue),
      netProfit: parseAmount(profitLoss.netProfit),
      cashBalance,
      bankBalance,
      outstandingCustomers: parseAmount(outstandingCustomers.totals.outstandingAmount),
      outstandingSuppliers: parseAmount(outstandingSuppliers.totals.outstandingAmount),
    },
    trialBalance: {
      debitTotal: parseAmount(trialBalance.totals.debit),
      creditTotal: parseAmount(trialBalance.totals.credit),
      difference: parseAmount(trialBalance.validation.difference),
      balanced: trialBalance.validation.balanced,
    },
    charges,
    stock: {
      paddyQty: stockTotals.paddy,
      riceQty: stockTotals.rice,
      brokenQty: stockTotals.broken,
      bardanaIn,
      bardanaOut,
      bardanaBalance,
      lowStock,
      valuation: parseAmount(stockReport.totals.closingValue),
    },
    dayBook: {
      date: toDate.toISOString(),
      rows: dayBook.rows.slice(0, 10),
    },
  };
}

export async function getDashboardCharts(params: Partial<DashboardRange>) {
  const { fromDate, toDate } = await resolveRange(params);
  const [purchasePeriods, salesPeriods, stockReport] = await Promise.all([
    storage.getPeriodPurchases(fromDate, toDate, undefined, "month"),
    storage.getPeriodSales(fromDate, toDate, undefined, "month"),
    storage.getStockReport({ fromDate, toDate }),
  ]);

  const monthlyTotals = purchasePeriods.rows.map((row, idx) => ({
    name: format(new Date(row.periodStart), "MMM"),
    purchases: parseAmount(row.totalAmount),
    sales: parseAmount(salesPeriods.rows[idx]?.totalAmount || "0"),
  }));

  const productStock = stockReport.rows.slice(0, 12).map((r) => ({
    name: r.itemName,
    stock: parseAmount(r.closingQty),
    unit: r.unit,
  }));

  return { monthlyTotals, productStock };
}

export async function getDashboardAlerts(params: Partial<DashboardRange>) {
  const { toDate } = await resolveRange(params);
  const trialBalance = await storage.getTrialBalance(toDate);
  const products = await storage.getProducts();
  const outstandingCustomers = await storage.getOutstandingCustomers(toDate);
  const outstandingSuppliers = await storage.getOutstandingSuppliers(toDate);

  const alerts: Array<{ key: string; severity: "info" | "warning" | "critical"; message: string }> = [];

  if (!trialBalance.validation.balanced) {
    alerts.push({
      key: "trial_balance_mismatch",
      severity: "critical",
      message: `Trial balance mismatch: difference Rs. ${parseAmount(trialBalance.validation.difference).toLocaleString()}`,
    });
  }

  const negativeStock = products.filter((p) => parseAmount(p.currentStock || "0") < 0);
  if (negativeStock.length > 0) {
    alerts.push({
      key: "negative_stock",
      severity: "critical",
      message: `${negativeStock.length} item(s) have negative stock.`,
    });
  }

  const overdueCustomers = outstandingCustomers.rows.filter((r) => r.daysOutstanding > 0);
  if (overdueCustomers.length > 0) {
    alerts.push({
      key: "overdue_customers",
      severity: "warning",
      message: `${overdueCustomers.length} customer invoice(s) are overdue.`,
    });
  }

  const overdueSuppliers = outstandingSuppliers.rows.filter((r) => r.daysOutstanding > 0);
  if (overdueSuppliers.length > 0) {
    alerts.push({
      key: "overdue_suppliers",
      severity: "warning",
      message: `${overdueSuppliers.length} supplier invoice(s) are overdue.`,
    });
  }

  const duplicateCheck = async () => {
    const [purchases, sales, receipts, journals, expenses] = await Promise.all([
      storage.getPurchases(),
      storage.getSales(),
      storage.getReceiptVouchers(),
      storage.getJournalVouchers(),
      storage.getExpenses(),
    ]);

    const duplicates = (items: Array<{ value: string }>) => {
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const item of items) {
        if (!item.value) continue;
        if (seen.has(item.value)) dupes.add(item.value);
        seen.add(item.value);
      }
      return dupes.size;
    };

    const count =
      duplicates(purchases.map((p) => ({ value: p.invoiceNumber }))) +
      duplicates(sales.map((s) => ({ value: s.invoiceNumber }))) +
      duplicates(receipts.map((r) => ({ value: r.voucherNumber }))) +
      duplicates(journals.map((j) => ({ value: j.voucherNo }))) +
      duplicates(expenses.map((e) => ({ value: e.voucherNo })));

    return count;
  };

  const duplicateCount = await duplicateCheck();
  if (duplicateCount > 0) {
    alerts.push({
      key: "voucher_numbering",
      severity: "warning",
      message: `${duplicateCount} duplicate voucher number(s) detected.`,
    });
  }

  return { alerts };
}

export async function getDashboardStats() {
  const summary = await getDashboardSummary({});
  return {
    totalPurchases: summary.kpis.totalPurchases,
    totalSales: summary.kpis.totalSales,
    stockValue: summary.kpis.stockValue,
    profit: summary.kpis.netProfit,
  };
}

export async function getRecentActivity() {
  const dayBook = await storage.getDayBook(new Date());
  return dayBook.rows.slice(0, 10);
}
