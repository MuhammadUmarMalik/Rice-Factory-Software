import { format } from "date-fns";
import { storage } from "../models/storage";

type DashboardRange = { fromDate: Date; toDate: Date };
type DashboardSummaryScope = "core" | "details" | "full";

type DashboardSummaryCore = {
  filters: { fromDate: string; toDate: string };
  kpis: {
    totalPurchases: number;
    totalSales: number;
    stockValue: number;
    netProfit: number;
    cashBalance: number;
    bankBalance: number;
    outstandingCustomers: number;
    outstandingSuppliers: number;
  };
  trialBalance: { debitTotal: number; creditTotal: number; difference: number; balanced: boolean };
};

type DashboardSummaryDetails = {
  charges: {
    freight: number;
    loading: number;
    marketFee: number;
    brokerage: number;
    bardana: number;
    processing: number;
  };
  stock: {
    paddyQty: number;
    riceQty: number;
    brokenQty: number;
    bardanaIn: number;
    bardanaOut: number;
    bardanaBalance: number;
    lowStock: Array<{ id: number; name: string; stock: number; unit: string }>;
    valuation: number;
  };
  dayBook: {
    date: string;
    rows: Array<{
      id: string;
      type: string;
      partyName: string;
      mode: string;
      receipt: string;
      payment: string;
      referenceType?: string | null;
      referenceId?: number | null;
    }>;
  };
};

type DashboardSummaryFull = DashboardSummaryCore & DashboardSummaryDetails;

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

async function resolveRange(params: Partial<DashboardRange>): Promise<{ fromDate?: Date; toDate?: Date }> {
  if (!params.fromDate && !params.toDate) {
    return {}; // No filter - show all data
  }
  const now = new Date();
  const fromDate = params.fromDate ? startOfDay(params.fromDate) : startOfDay(now);
  const toDate = params.toDate ? endOfDay(params.toDate) : endOfDay(now);
  return { fromDate, toDate };
}

function classifyProduct(name: string) {
  const label = name.toLowerCase();
  if (label.includes("paddy") || label.includes("parboiled")) return "paddy";
  if (label.includes("broken")) return "broken";
  if (label.includes("bardana") || label.includes("bag")) return "bardana";
  return "rice";
}

function normalizePurchaseChargeType(value: string | null | undefined) {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "accountant clerk" || raw === "accountant/clerk" || raw === "accountant / clerk") {
    return "accountant_clerk";
  }

  const normalized = raw.replace(/[^a-z0-9]+/g, "_");
  if (normalized.includes("phone") && normalized.includes("anal")) return "phone_analysis";
  if (normalized.startsWith("comm") || normalized.includes("commi")) return "commission";
  if (normalized.startsWith("mitha")) return "mitha_sukri";
  if (normalized.startsWith("load") || normalized.startsWith("unload") || normalized.includes("filling")) {
    return "loading_filling";
  }
  if (normalized.startsWith("market")) return "market_fee";
  if (normalized.startsWith("broker")) return "brokerage";
  if (normalized.startsWith("broken")) return "broken_allowance";
  if (normalized.startsWith("bard")) return "bardana";
  if (normalized.startsWith("freight")) return "freight";
  if (normalized.startsWith("weight") || normalized.includes("weigh")) return "weight";
  if (normalized.startsWith("other")) return "other";
  if (normalized.startsWith("accountant")) return "accountant_clerk";
  return normalized;
}

function normalizeDateValue(value: Date | string | number | null | undefined) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Legacy rows may store Unix seconds; modern code may pass milliseconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inDateRange(value: Date | string | number | null | undefined, fromDate?: Date, toDate?: Date) {
  if (!fromDate && !toDate) return true;
  const d = normalizeDateValue(value);
  if (!d) return false;
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

function emptyCoreData(fromDate: Date, toDate: Date): DashboardSummaryCore {
  return {
    filters: { fromDate: fromDate.toISOString(), toDate: toDate.toISOString() },
    kpis: {
      totalPurchases: 0,
      totalSales: 0,
      stockValue: 0,
      netProfit: 0,
      cashBalance: 0,
      bankBalance: 0,
      outstandingCustomers: 0,
      outstandingSuppliers: 0,
    },
    trialBalance: { debitTotal: 0, creditTotal: 0, difference: 0, balanced: true },
  };
}

export async function getDashboardSummary(
  params: Partial<DashboardRange>,
  scope: "core",
): Promise<DashboardSummaryCore>;
export async function getDashboardSummary(
  params: Partial<DashboardRange>,
  scope: "details",
): Promise<DashboardSummaryDetails>;
export async function getDashboardSummary(
  params: Partial<DashboardRange>,
  scope?: "full",
): Promise<DashboardSummaryFull>;
export async function getDashboardSummary(
  params: Partial<DashboardRange>,
  scope: DashboardSummaryScope,
): Promise<DashboardSummaryCore | DashboardSummaryDetails | DashboardSummaryFull>;

export async function getDashboardSummary(
  params: Partial<DashboardRange>,
  scope: DashboardSummaryScope = "full",
): Promise<DashboardSummaryCore | DashboardSummaryDetails | DashboardSummaryFull> {
  const { fromDate, toDate } = await resolveRange(params);
  const hasDateFilter = fromDate != null || toDate != null;
  const filterFrom = fromDate ?? new Date(0);
  const filterTo = toDate ?? new Date();
  const filtersDisplay = hasDateFilter
    ? { fromDate: filterFrom.toISOString(), toDate: filterTo.toISOString() }
    : { fromDate: "all", toDate: "all" };

  const includeCore = scope === "full" || scope === "core";
  const includeDetails = scope === "full" || scope === "details";

  let stockReport: Awaited<ReturnType<typeof storage.getStockReport>> | null = null;
  try {
    stockReport = includeCore || includeDetails ? await storage.getStockReport({ fromDate, toDate }) : null;
  } catch (err) {
    console.error("[dashboard summary] getStockReport failed:", err instanceof Error ? err.message : err);
  }

  let coreData: DashboardSummaryCore | null = null;

  if (includeCore) {
    try {
    const asOfDate = toDate ?? new Date();
    const [profitLoss, trialBalance, purchasesReport, salesReport, accounts, outstandingCustomers, outstandingSuppliers] =
      await Promise.all([
        storage.getProfitLoss(fromDate, toDate),
        storage.getTrialBalance(asOfDate),
        storage.getPurchaseReport({ fromDate, toDate }),
        storage.getSalesReport({ fromDate, toDate }),
        storage.getAccounts(),
        storage.getOutstandingCustomers(asOfDate),
        storage.getOutstandingSuppliers(asOfDate),
      ]);

    const cashBankAccounts = accounts.filter((a) => {
      const name = (a.name || "").toLowerCase();
      const isCash = name.includes("cash");
      const isBank = name.includes("bank") || a.type === "bank";
      const isSystemCash = a.isSystemAccount && a.type === "asset";
      return isCash || isBank || isSystemCash;
    });

    const cashAccountIds = new Set(
      cashBankAccounts
        .filter((a) => (a.name || "").toLowerCase().includes("cash") || (a.isSystemAccount && a.type === "asset"))
        .map((a) => a.id),
    );
    const bankAccountIds = new Set(
      cashBankAccounts
        .filter((a) => (a.name || "").toLowerCase().includes("bank") || a.type === "bank")
        .map((a) => a.id),
    );

    const ledgerToDate = await storage.getLedgerEntries(undefined, undefined, undefined, toDate ?? undefined);
    let cashBalance = cashBankAccounts
      .filter((a) => cashAccountIds.has(a.id))
      .reduce((sum, a) => sum + parseAmount(a.openingBalance || "0"), 0);
    let bankBalance = cashBankAccounts
      .filter((a) => bankAccountIds.has(a.id))
      .reduce((sum, a) => sum + parseAmount(a.openingBalance || "0"), 0);
    for (const entry of ledgerToDate) {
      const amount = parseAmount(entry.amount);
      if (cashAccountIds.has(entry.accountId)) {
        cashBalance += entry.transactionType === "debit" ? amount : -amount;
      }
      if (bankAccountIds.has(entry.accountId)) {
        bankBalance += entry.transactionType === "debit" ? amount : -amount;
      }
    }

    const pt = purchasesReport?.totals;
    const st = salesReport?.totals;
    const tbTotals = trialBalance?.totals;
    const tbVal = trialBalance?.validation;
    const ocTotals = outstandingCustomers?.totals;
    const osTotals = outstandingSuppliers?.totals;

    coreData = {
      filters: filtersDisplay,
      kpis: {
        totalPurchases: parseAmount(pt?.total),
        totalSales: parseAmount(st?.total),
        stockValue: parseAmount(stockReport?.totals?.closingValue),
        netProfit: parseAmount(profitLoss?.netProfit),
        cashBalance,
        bankBalance,
        outstandingCustomers: parseAmount(ocTotals?.outstandingAmount),
        outstandingSuppliers: parseAmount(osTotals?.outstandingAmount),
      },
      trialBalance: {
        debitTotal: parseAmount(tbTotals?.debit),
        creditTotal: parseAmount(tbTotals?.credit),
        difference: parseAmount(tbVal?.difference),
        balanced: tbVal?.balanced ?? false,
      },
    };
  } catch (err) {
    console.error("[dashboard summary] core data failed:", err instanceof Error ? err.message : err);
    coreData = emptyCoreData(filterFrom, filterTo);
  }
  }

  let detailsData: DashboardSummaryDetails | null = null;

  if (includeDetails) {
    try {
    const [products, purchases, sales] = await Promise.all([
      storage.getProducts(),
      storage.getPurchases(),
      storage.getSales(),
    ]);

    let dayBookDate = toDate ?? new Date();
    let dayBook = await storage.getDayBook(dayBookDate);

    // If dashboard is unfiltered and today's day book is empty, fall back to the latest ledger date.
    if (!hasDateFilter && (dayBook.rows?.length ?? 0) === 0) {
      const allLedger = await storage.getLedgerEntries();
      const latestEntry = allLedger.at(-1);
      if (latestEntry?.entryDate) {
        const latestDate = new Date(latestEntry.entryDate as unknown as string | number | Date);
        if (!Number.isNaN(latestDate.getTime())) {
          dayBookDate = latestDate;
          dayBook = await storage.getDayBook(dayBookDate);
        }
      }
    }

    const charges = {
      freight: 0,
      loading: 0,
      marketFee: 0,
      brokerage: 0,
      bardana: 0,
      processing: 0,
    };

    const filteredPurchases = purchases.filter((p) =>
      inDateRange((p.purchaseDate as any) ?? (p.createdAt as any), fromDate, toDate),
    );
    const filteredSales = sales.filter((s) =>
      inDateRange((s.saleDate as any) ?? (s.createdAt as any), fromDate, toDate),
    );

    // Pull purchase charge lines and aggregate by charge type.
    const purchaseChargeLists = await Promise.all(
      filteredPurchases.map(async (p) => ({
        purchase: p,
        charges: await storage.getPurchaseCharges(p.id),
      })),
    );

    for (const { purchase, charges: lines } of purchaseChargeLists) {
      for (const charge of lines) {
        const amount = parseAmount(charge.amount);
        if (amount <= 0) continue;
        const type = normalizePurchaseChargeType(charge.type);

        if (type === "freight") charges.freight += amount;
        if (type === "loading_filling" || type === "weight") charges.loading += amount;
        if (type === "market_fee") charges.marketFee += amount;
        if (type === "brokerage" || type === "commission") charges.brokerage += amount;
        if (type === "bardana") charges.bardana += amount;
        if (type === "accountant_clerk") charges.processing += amount;
      }

      // Broker commission also exists as a normalized top-level purchase field.
      charges.brokerage += parseAmount(purchase.brokerCommissionAmount);
    }

    // Sales-side charge fields.
    for (const sale of filteredSales) {
      charges.loading += parseAmount(sale.loadingCharges) + parseAmount(sale.weighingCharges);
      charges.processing += parseAmount(sale.rentCharges);
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

    const bardanaRows = (stockReport?.rows || []).filter(
      (row) => classifyProduct(row.itemName || row.itemName) === "bardana",
    );
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

    detailsData = {
      charges,
      stock: {
        paddyQty: stockTotals.paddy,
        riceQty: stockTotals.rice,
        brokenQty: stockTotals.broken,
        bardanaIn,
        bardanaOut,
        bardanaBalance,
        lowStock,
        valuation: parseAmount(stockReport?.totals?.closingValue),
      },
      dayBook: {
        date: dayBookDate.toISOString(),
        rows: dayBook.rows
          .filter((r) => parseAmount(r.receipt) > 0 || parseAmount(r.payment) > 0)
          .slice(0, 10),
      },
    };
    } catch (err) {
      console.error("[dashboard summary] details failed:", err instanceof Error ? err.message : err);
      detailsData = {
        charges: { freight: 0, loading: 0, marketFee: 0, brokerage: 0, bardana: 0, processing: 0 },
        stock: {
          paddyQty: 0,
          riceQty: 0,
          brokenQty: 0,
          bardanaIn: 0,
          bardanaOut: 0,
          bardanaBalance: 0,
          lowStock: [],
          valuation: 0,
        },
        dayBook: { date: (toDate ?? new Date()).toISOString(), rows: [] },
      };
    }
  }

  if (scope === "core") return coreData ?? emptyCoreData(filterFrom, filterTo);
  if (scope === "details") return detailsData ?? ({} as DashboardSummaryDetails);

  return { ...(coreData ?? {}), ...(detailsData ?? {}) } as DashboardSummaryFull;
}

export async function getDashboardCharts(params: Partial<DashboardRange>) {
  const resolved = await resolveRange(params);
  const now = new Date();
  const fromDate = resolved.fromDate ?? new Date(1980, 0, 1);
  const toDate = resolved.toDate ?? endOfDay(now);
  const [purchasePeriods, salesPeriods, stockReport] = await Promise.all([
    storage.getPeriodPurchases(fromDate, toDate, undefined, "month"),
    storage.getPeriodSales(fromDate, toDate, undefined, "month"),
    storage.getStockReport({ fromDate, toDate }),
  ]);

  const byMonth = new Map<string, { label: string; periodStart: Date; purchases: number; sales: number }>();
  for (const row of purchasePeriods.rows) {
    const key = format(new Date(row.periodStart), "yyyy-MM");
    const existing = byMonth.get(key);
    byMonth.set(key, {
      label: format(new Date(row.periodStart), "MMM yy"),
      periodStart: new Date(row.periodStart),
      purchases: parseAmount(row.totalAmount),
      sales: existing?.sales || 0,
    });
  }
  for (const row of salesPeriods.rows) {
    const key = format(new Date(row.periodStart), "yyyy-MM");
    const existing = byMonth.get(key);
    byMonth.set(key, {
      label: format(new Date(row.periodStart), "MMM yy"),
      periodStart: new Date(row.periodStart),
      purchases: existing?.purchases || 0,
      sales: parseAmount(row.totalAmount),
    });
  }
  const monthlyTotals = Array.from(byMonth.values())
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
    .map((row) => ({
      name: row.label,
      purchases: row.purchases,
      sales: row.sales,
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
  const asOfDate = toDate ?? new Date();
  const alerts: Array<{ key: string; severity: "info" | "warning" | "critical"; message: string }> = [];

  let trialBalance: Awaited<ReturnType<typeof storage.getTrialBalance>> | null = null;
  let products: Awaited<ReturnType<typeof storage.getProducts>> = [];
  let outstandingCustomers: Awaited<ReturnType<typeof storage.getOutstandingCustomers>> | null = null;
  let outstandingSuppliers: Awaited<ReturnType<typeof storage.getOutstandingSuppliers>> | null = null;

  try {
    [trialBalance, products, outstandingCustomers, outstandingSuppliers] = await Promise.all([
      storage.getTrialBalance(asOfDate),
      storage.getProducts(),
      storage.getOutstandingCustomers(asOfDate),
      storage.getOutstandingSuppliers(asOfDate),
    ]);
  } catch (err) {
    console.error("[dashboard alerts] failed to load base data:", err instanceof Error ? err.message : err);
    return { alerts };
  }

  const tbValidation = trialBalance?.validation;
  if (tbValidation && !tbValidation.balanced) {
    alerts.push({
      key: "trial_balance_mismatch",
      severity: "critical",
      message: `Trial balance mismatch: difference Rs. ${parseAmount(tbValidation.difference).toLocaleString()}`,
    });
  }

  const negativeStock = (products || []).filter((p) => parseAmount(p?.currentStock || "0") < 0);
  if (negativeStock.length > 0) {
    alerts.push({
      key: "negative_stock",
      severity: "critical",
      message: `${negativeStock.length} item(s) have negative stock.`,
    });
  }

  const overdueCustomers = (outstandingCustomers?.rows ?? []).filter((r) => (r?.daysOutstanding ?? 0) > 0);
  if (overdueCustomers.length > 0) {
    alerts.push({
      key: "overdue_customers",
      severity: "warning",
      message: `${overdueCustomers.length} customer invoice(s) are overdue.`,
    });
  }

  const overdueSuppliers = (outstandingSuppliers?.rows ?? []).filter((r) => (r?.daysOutstanding ?? 0) > 0);
  if (overdueSuppliers.length > 0) {
    alerts.push({
      key: "overdue_suppliers",
      severity: "warning",
      message: `${overdueSuppliers.length} supplier invoice(s) are overdue.`,
    });
  }

  let duplicateCount = 0;
  try {
    const [purchases, sales, receipts, journals, expenses] = await Promise.all([
      storage.getPurchases(),
      storage.getSales(),
      storage.getReceiptVouchers(),
      storage.getJournalVouchers(),
      storage.getExpenses(),
    ]);
    const duplicates = (items: Array<{ value?: string | null }>) => {
      const seen = new Set<string>();
      let count = 0;
      for (const item of items) {
        const v = item?.value?.trim?.();
        if (!v) continue;
        if (seen.has(v)) count++;
        seen.add(v);
      }
      return count;
    };
    duplicateCount =
      duplicates((purchases || []).map((p) => ({ value: p?.invoiceNumber }))) +
      duplicates((sales || []).map((s) => ({ value: s?.invoiceNumber }))) +
      duplicates((receipts || []).map((r) => ({ value: (r as { voucherNumber?: string })?.voucherNumber }))) +
      duplicates((journals || []).map((j) => ({ value: j?.voucherNo }))) +
      duplicates((expenses || []).map((e) => ({ value: e?.voucherNo })));
  } catch (err) {
    console.error("[dashboard alerts] duplicate check failed:", err instanceof Error ? err.message : err);
  }

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
  const summary = await getDashboardSummary({}, "core");
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
