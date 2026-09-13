/**
 * Reporting queries, extracted from the "// Reports" and "// New Accounting
 * Reports" sections of storage.ts.
 *
 * Everything here is read-only and derived: no report stores its own copy of a
 * figure, each recomputes from the ledger, the documents and the product rows.
 * The arithmetic that is shared with other consumers lives in
 * ../services/reports/calculations; this file is the persistence half.
 */
import { db } from "./db";
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import {
  computeAgingBuckets,
  computeBalanceSheetValidation,
  computeInventoryRollForward,
  computeWeightedAverageCost,
  resolvePaymentStatus,
  computeTrialBalanceTotals,
} from "../services/reports/calculations";
import {
  accounts, products, purchases, purchaseItems, processing, sales, saleItems,
  ledgerEntries, employees, employeeSalaryStructures, payrolls,
  receiptVouchers, journalVouchers, cashTransactions, cashReceipts, cashPayments,
  contraVouchers, expenseEntries,
  type Employee, type Purchase, type PurchaseItem, type Sale, type SaleItem,
  type LedgerEntry,
} from "../db/schema";
import { cashOrBankAccountIds } from "../utils/cash-accounts";
import { formatMoney, parseAmount } from "../utils/parse";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  localDateKey,
  startOfMonth,
  startOfPayrollMonth,
  startOfWeek,
  weekNumber,
} from "../utils/dates";
import {
  buildLedgerReferenceWhere,
  ensureCashAccount,
  ensureSystemAccount,
} from "./ledger.model";
import * as ledgerModel from "./ledger.model";
import * as productsModel from "./products.model";
import * as purchasesModel from "./purchases.model";
import * as salesModel from "./sales.model";
import * as accountsModel from "./accounts.model";
import * as jvModel from "./journal-vouchers.model";
import {
  ledgerSumByNormal,
  normalSideForAccountType,
  type NormalSide,
} from "./accounts.model";
import { cleanNarrationSegment } from "../utils/narration";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;

/**
 * Same mapping as ledger.model's getLedgerReference, but over the loose row
 * shapes the report queries select — they project a handful of columns rather
 * than a whole LedgerEntry.
 */
function getLedgerReferenceFromValues(entry: {
  saleId?: number | null;
  purchaseId?: number | null;
  receiptVoucherId?: number | null;
  journalVoucherId?: number | null;
  contraVoucherId?: number | null;
  expenseEntryId?: number | null;
}): { referenceType: string | null; referenceId: number | null } {
  if (entry.saleId) return { referenceType: "sale", referenceId: entry.saleId };
  if (entry.purchaseId) return { referenceType: "purchase", referenceId: entry.purchaseId };
  if (entry.receiptVoucherId) return { referenceType: "receipt_voucher", referenceId: entry.receiptVoucherId };
  if (entry.journalVoucherId) return { referenceType: "journal_voucher", referenceId: entry.journalVoucherId };
  if (entry.contraVoucherId) return { referenceType: "contra_voucher", referenceId: entry.contraVoucherId };
  if (entry.expenseEntryId) return { referenceType: "expense", referenceId: entry.expenseEntryId };
  return { referenceType: null, referenceId: null };
}

async function getPurchaseDeductionTotals(
  field: "bardanaKatKg" | "lessKg",
  filters?: { fromDate?: Date; toDate?: Date; supplierId?: number },
) {
  const conditions = [isNull(purchases.deletedAt), isNull(purchaseItems.deletedAt)];
  if (filters?.fromDate) conditions.push(gte(purchases.purchaseDate, filters.fromDate));
  if (filters?.toDate) conditions.push(lte(purchases.purchaseDate, endOfDay(filters.toDate)));
  if (filters?.supplierId) conditions.push(eq(purchases.supplierId, filters.supplierId));

  const fieldRef = field === "bardanaKatKg" ? purchaseItems.bardanaKatKg : purchaseItems.lessKg;
  const [row] = db
    .select({
      totalKg: sql<string>`COALESCE(SUM(CAST(${fieldRef} AS REAL)), 0)`,
      totalBags: sql<string>`COALESCE(SUM(CAST(${purchaseItems.bags} AS REAL)), 0)`,
      // Count only purchases that actually carry this deduction — counting every
      // purchase in range made the Bardana and Less reports show an identical
      // "Purchases" figure regardless of which deduction was applied.
      purchaseCount: sql<string>`COALESCE(COUNT(DISTINCT CASE WHEN CAST(${fieldRef} AS REAL) > 0 THEN ${purchases.id} END), 0)`,
    })
    .from(purchaseItems)
    // Inner join: a purchase item with no surviving parent purchase is not a
    // purchase. With a left join, orphans leaked in whenever no date filter was
    // set (NULL deletedAt passes isNull) but dropped out as soon as one was.
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .where(and(...conditions))
    .all();

  const totalKg = parseAmount(row?.totalKg || "0");
  const totalBags = parseAmount(row?.totalBags || "0");
  const avgPerBag = totalBags > 0 ? totalKg / totalBags : 0;
  const purchaseCount = Number(row?.purchaseCount || 0);

  return {
    totals: {
      totalKg: totalKg.toString(),
      totalBags: totalBags.toString(),
      avgPerBag: avgPerBag.toString(),
      purchaseCount,
    },
  };
}

export async function getStockReport(filters?: {
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
          qty: sql<string>`COALESCE(SUM(CAST(${saleItems.quantityKg} AS REAL)), 0)`,
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
      qty: sql<string>`COALESCE(SUM(CAST(${saleItems.quantityKg} AS REAL)), 0)`,
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
    const productAvgCost = parseAmount(p.avgPurchasePrice || "0");

    // Opening is valued at the average purchase cost *up to* the period start,
    // not at the product's live average, so the roll-forward stays internally
    // consistent when cost moves during the period.
    const beforePurchaseQty = purchaseBeforeQty.get(p.id) || 0;
    const beforePurchaseValue = purchaseBeforeValue.get(p.id) || 0;
    const priorAvgCost = beforePurchaseQty > 0 ? beforePurchaseValue / beforePurchaseQty : productAvgCost;

    const openingInQty = beforePurchaseQty + (procInBeforeQty.get(p.id) || 0);
    const openingOutQty = (salesBeforeQty.get(p.id) || 0) + (procOutBeforeQty.get(p.id) || 0);
    const openingQty = openingInQty - openingOutQty;
    const openingValue = openingQty * priorAvgCost;

    const periodPurchaseQty = purchaseInQty.get(p.id) || 0;
    const periodPurchaseValue = purchaseInValue.get(p.id) || 0;
    const periodPurchaseAvg = periodPurchaseQty > 0 ? periodPurchaseValue / periodPurchaseQty : priorAvgCost;

    const inQty = periodPurchaseQty + (procInQty.get(p.id) || 0);
    const inValue = periodPurchaseValue + (procInQty.get(p.id) || 0) * periodPurchaseAvg;
    const outQty = (salesInQty.get(p.id) || 0) + (procOutInQty.get(p.id) || 0);
    // Outflows must use the period weighted average, not the live product average.
    const outValue =
      outQty *
      computeWeightedAverageCost({
        openingQty,
        openingValue,
        inQty,
        inValue,
        fallbackCost: productAvgCost,
      });

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

  // closingQty is derived from opening + in - out, so rollForwardDifference can
  // never be non-zero — it only guards against arithmetic drift. The check that
  // can actually fail is closing vs. the live product stock, and it is only
  // meaningful when the window covers every movement up to now.
  const coversAllHistory = !from && (!to || to.getTime() >= Date.now());
  const stockDifference = coversAllHistory
    ? rows.reduce((sum, r) => sum + (parseAmount(r.closingQty) - parseAmount(r.currentStock || "0")), 0)
    : null;
  const mismatchedProducts = coversAllHistory
    ? rows
        .filter((r) => Math.abs(parseAmount(r.closingQty) - parseAmount(r.currentStock || "0")) >= 0.0001)
        .map((r) => ({
          productId: r.productId,
          itemName: r.itemName,
          closingQty: r.closingQty,
          currentStock: r.currentStock || "0",
        }))
    : [];

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
      stockMatchesLedger: stockDifference === null ? null : Math.abs(stockDifference) < 0.0001,
      stockDifference: stockDifference === null ? null : stockDifference.toString(),
      mismatchedProducts,
    },
  };
}

export async function getTrialBalance(asOfDate?: Date) {
  const allAccounts = await accountsModel.getAccounts();
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

export async function getProfitLoss(startDate?: Date, endDate?: Date) {
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

  const operatingExpenses = await sumExpenseMovements(from, to);
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

export async function getPurchaseReport(filters?: {
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
    // Tie-break on id so same-day rows keep a stable order between the screen,
    // the print mapper and repeated calls.
    .orderBy(desc(purchases.purchaseDate), desc(purchases.id))
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
        status: resolvePaymentStatus(total, paid),
      };
    })
    .filter((r) => !filters?.paymentStatus || r.status === filters.paymentStatus);

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

export async function getBardanaReport(filters?: { fromDate?: Date; toDate?: Date; supplierId?: number }) {
  return getPurchaseDeductionTotals("bardanaKatKg", filters);
}

export async function getLessReport(filters?: { fromDate?: Date; toDate?: Date; supplierId?: number }) {
  return getPurchaseDeductionTotals("lessKg", filters);
}

export async function getSalesReport(filters?: {
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
      rent: sales.rentCharges,
      discountAmount: sales.discountAmount,
      total: sales.totalAmount,
      received: sales.paidAmount,
    })
    .from(sales)
    .leftJoin(accounts, eq(sales.customerId, accounts.id))
    .where(and(...conditions))
    // Tie-break on id so same-day rows keep a stable order between the screen,
    // the print mapper and repeated calls.
    .orderBy(desc(sales.saleDate), desc(sales.id))
    .all()
    .map((r) => {
      const total = parseAmount(r.total || "0");
      const received = parseAmount(r.received || "0");
      const balance = Math.max(total - received, 0);
      const otherCharges = parseAmount(r.loading || "0") + parseAmount(r.weighing || "0") + parseAmount(r.other || "0") + parseAmount((r as { rent?: string }).rent || "0");
      return {
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        saleDate: new Date(r.saleDate as any),
        customerId: r.customerId,
        customerName: r.customerName || "",
        subtotal: parseAmount(r.subtotal || "0").toString(),
        discount: parseAmount((r as { discountAmount?: string }).discountAmount || "0").toString(),
        tax: parseAmount(r.tax || "0").toString(),
        otherCharges: otherCharges.toString(),
        total: total.toString(),
        received: received.toString(),
        balance: balance.toString(),
        // Same single definition the badge and the printed column read, so a
        // row can never display one status and be excluded by the filter for
        // another.
        status: resolvePaymentStatus(total, received),
      };
    })
    .filter((r) => !filters?.paymentStatus || r.status === filters.paymentStatus);

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

export async function getPeriodPurchases(startDate: Date, endDate: Date, supplierId?: number, groupBy: "day" | "week" | "month" | "year" = "month") {
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
          : groupBy === "year" ? new Date(dt.getFullYear(), 0, 1) : startOfMonth(dt);
    const periodEnd =
      groupBy === "day" ? endOfDay(periodStart) : groupBy === "week" ? endOfWeek(dt) : groupBy === "year" ? new Date(dt.getFullYear(), 11, 31, 23, 59, 59, 999) : endOfMonth(dt);

    const key =
      groupBy === "day"
        ? localDateKey(periodStart)
        : groupBy === "week"
          ? `${periodStart.getFullYear()}-W${String(weekNumber(periodStart)).padStart(2, "0")}`
          : groupBy === "year" ? String(periodStart.getFullYear()) : `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;

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

export async function getPeriodSales(startDate: Date, endDate: Date, customerId?: number, groupBy: "day" | "week" | "month" | "year" = "month") {
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
          : groupBy === "year" ? new Date(dt.getFullYear(), 0, 1) : startOfMonth(dt);
    const periodEnd =
      groupBy === "day" ? endOfDay(periodStart) : groupBy === "week" ? endOfWeek(dt) : groupBy === "year" ? new Date(dt.getFullYear(), 11, 31, 23, 59, 59, 999) : endOfMonth(dt);

    const key =
      groupBy === "day"
        ? localDateKey(periodStart)
        : groupBy === "week"
          ? `${periodStart.getFullYear()}-W${String(weekNumber(periodStart)).padStart(2, "0")}`
          : groupBy === "year" ? String(periodStart.getFullYear()) : `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;

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

export async function getGrossProfit(startDate: Date, endDate: Date) {
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
            saleId: ledgerEntries.saleId,
            amount: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
          })
          .from(ledgerEntries)
          .where(
            and(
              inArray(ledgerEntries.accountId, cogsAccountIds),
              buildLedgerReferenceWhere("sale", null) as any,
              gte(ledgerEntries.entryDate, from),
              lte(ledgerEntries.entryDate, to),
            ),
          )
          .groupBy(ledgerEntries.saleId)
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

  // Fall back to the ledger totals only when there is genuinely nothing to sum
  // per row. `|| fallback` also fired on a legitimate zero — a period whose
  // sales netted to 0 silently reported the ledger's income balance instead.
  const netSales = rows.length
    ? rows.reduce((sum, r) => sum + parseAmount(r.netSales), 0)
    : parseAmount(revenueRow?.total || "0");
  const costOfGoodsSold = cogsBySale.size
    ? rows.reduce((sum, r) => sum + parseAmount(r.costOfGoodsSold), 0)
    : parseAmount(cogsRow?.total || "0");
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

export async function getDayBook(date: Date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = endOfDay(dayStart);

  const accountRows = db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      isSystemAccount: accounts.isSystemAccount,
      openingBalance: accounts.openingBalance,
    })
    .from(accounts)
    .all();

  const cashBankIds = cashOrBankAccountIds(accountRows);
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
  // The mill's opening cash/bank float is held on the account row, not as a
  // ledger entry, so movement alone understates the day's opening balance by
  // whatever was in the drawer before the first voucher was ever posted. Every
  // other report (trial balance, account ledger) already adds it.
  const openingFloat = accountRows
    .filter((a) => cashBankIdSet.has(a.id))
    .reduce((sum, a) => sum + parseAmount(a.openingBalance || "0"), 0);
  const openingValue = openingFloat + parseAmount(openingRow?.total || "0");
  const balType: "" | "CR" | "DR" = openingValue === 0 ? "" : openingValue >= 0 ? "DR" : "CR";
  const openingBalance = {
    amount: Math.abs(openingValue).toString(),
    type: balType,
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
    // The reference *type* must match what `getLedgerReferenceFromValues`
    // derives from the ledger row ("receipt_voucher"), otherwise the group
    // lookup below misses and the voucher is dropped from the day book.
    // Receipt vs payment is a display distinction only — it belongs in
    // `typeCode`, not in the key.
    addMeta({
      referenceType: "receipt_voucher",
      referenceId: row.id,
      voucherNo: row.voucherNo,
      typeCode: row.voucherType === "CR" ? "RV" : "PV",
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
      referenceType: "contra_voucher",
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
      saleId: ledgerEntries.saleId,
      purchaseId: ledgerEntries.purchaseId,
      receiptVoucherId: ledgerEntries.receiptVoucherId,
      journalVoucherId: ledgerEntries.journalVoucherId,
      contraVoucherId: ledgerEntries.contraVoucherId,
      expenseEntryId: ledgerEntries.expenseEntryId,
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
    const ref = getLedgerReferenceFromValues(entry as any);
    if (!ref.referenceType || !ref.referenceId) continue;
    const key = `${ref.referenceType}:${ref.referenceId}`;
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
    const raw = cleanNarrationSegment(group.meta.narration);
    return raw ? raw.toUpperCase() : "-";
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

export async function getOutstandingCustomers(asOfDate: Date, customerId?: number) {
  const to = endOfDay(asOfDate);
  const saleConditions = [lte(sales.saleDate, to)];
  if (customerId) saleConditions.push(eq(sales.customerId, customerId));

  const salesRows = db
    .select({
      saleId: sales.id,
      invoiceNumber: sales.invoiceNumber,
      saleDate: sales.saleDate,
      dueDate: sales.dueDate,
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
      const dueDate = sale.dueDate ? new Date(sale.dueDate as any) : saleDate;
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

export async function getOutstandingSuppliers(asOfDate: Date, supplierId?: number) {
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

async function sumExpenseMovements(startDate: Date, endDate: Date) {
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

export async function getIncomeStatement(startDate: Date, endDate: Date) {
  const summary = await getProfitLoss(startDate, endDate);
  return {
    period: summary.period,
    revenue: summary.revenue,
    costOfSales: summary.costOfSales,
    grossProfit: summary.grossProfit,
    operatingExpenses: summary.operatingExpenses,
    netProfit: summary.netProfit,
  };
}

async function sumLedgerBalancesAsOf(asOfDate: Date, accountType: string, normal: NormalSide) {
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

export async function getBalanceSheet(asOfDate: Date) {
  const asOf = endOfDay(asOfDate);

  const cash = await ensureCashAccount(db);
  const [cashMovement] = db
    .select({
      movement: sql<string>`COALESCE(SUM(CASE WHEN ${cashTransactions.transactionType} = 'DEBIT' THEN CAST(${cashTransactions.amount} AS REAL) ELSE -CAST(${cashTransactions.amount} AS REAL) END), 0)`,
    })
    .from(cashTransactions)
    .where(and(eq(cashTransactions.accountId, cash.id), lte(cashTransactions.transactionDate, asOf)))
    .all();
  const cashBalanceRaw = parseAmount(cash.openingBalance || "0") + parseAmount(cashMovement?.movement || "0");

  const [cashReceiptsRow] = db
    .select({ total: sql<string>`COALESCE(SUM(CAST(${cashReceipts.amount} AS REAL)), 0)` })
    .from(cashReceipts)
    .where(and(eq(cashReceipts.cashAccountId, 1), lte(cashReceipts.receiptDate, asOf)))
    .all();
  const [cashPaymentsRow] = db
    .select({ total: sql<string>`COALESCE(SUM(CAST(${cashPayments.amount} AS REAL)), 0)` })
    .from(cashPayments)
    .where(and(eq(cashPayments.cashAccountId, 1), lte(cashPayments.paymentDate, asOf)))
    .all();
  const cashBookBalanceRaw =
    parseAmount(cash.openingBalance || "0") +
    parseAmount(cashReceiptsRow?.total || "0") -
    parseAmount(cashPaymentsRow?.total || "0");

  const bankBalanceRaw = await sumLedgerBalancesAsOf(asOfDate, "bank", "DEBIT");
  const receivablesRaw = await sumLedgerBalancesAsOf(asOfDate, "customer", "DEBIT");
  const payablesRaw = await sumLedgerBalancesAsOf(asOfDate, "supplier", "CREDIT");
  const employeePayablesRaw = await sumLedgerBalancesAsOf(asOfDate, "employee", "CREDIT");

  const stockReport = await getStockReport({ toDate: asOfDate });
  const inventoryValueRaw = stockReport.totals.closingValue ? parseAmount(stockReport.totals.closingValue) : 0;

  const retainedEarningsRaw = parseAmount((await getIncomeStatement(new Date(0), asOfDate)).netProfit);
  const capitalAccount = await ensureSystemAccount(db, "Capital", "equity");

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
  const cashGapCents = toCents(cashBookBalanceRaw) - cashCents;
  const reasons: string[] = [];
  if (!validation.balanced) {
    reasons.push(
      `Assets and Liabilities+Equity differ by Rs. ${formatMoney(Math.abs(parseAmount(validation.difference)))}.`,
    );
  }
  if (cashGapCents !== 0) {
    reasons.push(
      `Cash book vs ledger mismatch: Rs. ${formatMoney(fromCents(Math.abs(cashGapCents)))}. This usually means some cash receipts/payments were saved in Cash in Hand but not posted to ledger.`,
    );
  }

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
    validation: { balanced: validation.balanced, difference: validation.difference, reasons },
  };
}

export async function getCapitalStatement(startDate: Date, endDate: Date) {
  const capital = await ensureSystemAccount(db, "Capital", "equity");
  const drawings = await ensureSystemAccount(db, "Drawings", "equity");

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

  const netProfit = parseAmount((await getProfitLoss(startDate, endDate)).netProfit);
  const closingCapital = openingCapital + additionalCapital + netProfit - drawingsAmount;

  return {
    openingCapital: openingCapital.toString(),
    additionalCapital: additionalCapital.toString(),
    drawings: drawingsAmount.toString(),
    netProfit: netProfit.toString(),
    closingCapital: closingCapital.toString(),
  };
}

export async function getSalaryAccount(startDate: Date, endDate: Date) {
  const from = startDate;
  const to = endOfDay(endDate);

  const rows = db
    .select({
      employeeId: payrolls.employeeId,
      payrollMonth: payrolls.payrollMonth,
      basicSalary: payrolls.basicSalary,
      allowances: payrolls.allowances,
      deductions: payrolls.deductions,
      netSalary: payrolls.netSalary,
      status: payrolls.status,
      employeeName: employees.name,
      accountId: employees.accountId,
    })
    .from(payrolls)
    .leftJoin(employees, eq(payrolls.employeeId, employees.id))
    .where(and(gte(payrolls.createdAt, from), lte(payrolls.createdAt, to)))
    .orderBy(payrolls.payrollMonth)
    .all();

  const employeeIds = Array.from(new Set(rows.map((r) => r.employeeId).filter((id): id is number => Number.isFinite(id))));
  const structures = employeeIds.length
    ? db
      .select({
        employeeId: employeeSalaryStructures.employeeId,
        effectiveFrom: employeeSalaryStructures.effectiveFrom,
        basicSalary: employeeSalaryStructures.basicSalary,
        allowances: employeeSalaryStructures.allowances,
        deductions: employeeSalaryStructures.deductions,
      })
      .from(employeeSalaryStructures)
      .where(inArray(employeeSalaryStructures.employeeId, employeeIds))
      .orderBy(desc(employeeSalaryStructures.effectiveFrom), desc(employeeSalaryStructures.id))
      .all()
    : [];

  const structuresByEmployee = new Map<number, typeof structures>();
  for (const s of structures) {
    const list = structuresByEmployee.get(s.employeeId) || [];
    list.push(s);
    structuresByEmployee.set(s.employeeId, list);
  }

  const mapped = rows.map((r) => {
    let basic = parseAmount(r.basicSalary || "0");
    let allowances = parseAmount(r.allowances || "0");
    let deductions = parseAmount(r.deductions || "0");
    let net = parseAmount(r.netSalary || "0");

    // Backfill stale zero payroll rows from effective salary structure for that payroll month.
    if (basic === 0 && allowances === 0 && deductions === 0 && net === 0) {
      const monthStart = startOfPayrollMonth(r.payrollMonth);
      const monthEnd = endOfMonth(monthStart);
      const effective = (structuresByEmployee.get(r.employeeId) || []).find(
        (s) => new Date(s.effectiveFrom as any) <= monthEnd,
      );
      if (effective) {
        basic = parseAmount(effective.basicSalary || "0");
        allowances = parseAmount(effective.allowances || "0");
        deductions = parseAmount(effective.deductions || "0");
        net = Math.max(basic + allowances - deductions, 0);
      }
    }

    const paid = (r as any).status === "paid" ? net : 0;
    const balance = Math.max(net - paid, 0);
    return {
      accountId: r.accountId ?? null,
      employee: r.employeeName || "Employee",
      salaryMonth: r.payrollMonth,
      basicSalary: basic.toString(),
      allowances: allowances.toString(),
      deductions: deductions.toString(),
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

export async function getReportDetail(referenceType: string, referenceId: number) {
  const type = (referenceType || "").toLowerCase();

    if (type === "sale") {
      const sale = await salesModel.getSale(referenceId);
      if (!sale) return null;
      const items = await salesModel.getSaleItems(referenceId);
      const customer = await accountsModel.getAccount(sale.customerId);
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
        { label: "Rent", amount: parseAmount((sale as { rentCharges?: string }).rentCharges || "0") },
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
          saleId: ledgerEntries.saleId,
          purchaseId: ledgerEntries.purchaseId,
          receiptVoucherId: ledgerEntries.receiptVoucherId,
          journalVoucherId: ledgerEntries.journalVoucherId,
          contraVoucherId: ledgerEntries.contraVoucherId,
          expenseEntryId: ledgerEntries.expenseEntryId,
          accountId: ledgerEntries.accountId,
          accountName: accounts.name,
        })
        .from(ledgerEntries)
        .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
        .where(buildLedgerReferenceWhere("sale", referenceId) as any)
        .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
        .all()
        .map((le) => ({
          ...le,
          ...getLedgerReferenceFromValues(le as any),
          description: saleNarration || le.description,
          debit: le.transactionType === "debit" ? le.amount : "0",
          credit: le.transactionType === "credit" ? le.amount : "0",
        }));
      return { type: "sale", sale, items, customer, ledgerEntries: ledger };
    }

    if (type === "purchase") {
      const purchase = await purchasesModel.getPurchaseWithDetails(referenceId);
      if (!purchase) return null;
      const supplier = await accountsModel.getAccount(purchase.supplierId);
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
          saleId: ledgerEntries.saleId,
          purchaseId: ledgerEntries.purchaseId,
          receiptVoucherId: ledgerEntries.receiptVoucherId,
          journalVoucherId: ledgerEntries.journalVoucherId,
          contraVoucherId: ledgerEntries.contraVoucherId,
          expenseEntryId: ledgerEntries.expenseEntryId,
          accountId: ledgerEntries.accountId,
          accountName: accounts.name,
        })
        .from(ledgerEntries)
        .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
        .where(buildLedgerReferenceWhere("purchase", referenceId) as any)
        .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
        .all()
        .map((le) => ({
          ...le,
          ...getLedgerReferenceFromValues(le as any),
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
          saleId: ledgerEntries.saleId,
          purchaseId: ledgerEntries.purchaseId,
          receiptVoucherId: ledgerEntries.receiptVoucherId,
          journalVoucherId: ledgerEntries.journalVoucherId,
          contraVoucherId: ledgerEntries.contraVoucherId,
          expenseEntryId: ledgerEntries.expenseEntryId,
          accountId: ledgerEntries.accountId,
          accountName: accounts.name,
        })
        .from(ledgerEntries)
        .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
        .where(buildLedgerReferenceWhere("expense", referenceId) as any)
        .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
        .all()
        .map((le) => ({
          ...le,
          ...getLedgerReferenceFromValues(le as any),
          debit: le.transactionType === "debit" ? le.amount : "0",
          credit: le.transactionType === "credit" ? le.amount : "0",
        }));
      return { type: "expense", expense, expenseAccount, payFromAccount, ledgerEntries: ledger };
    }

  if (type === "product") {
    const product = await productsModel.getProduct(referenceId);
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
    const account = await accountsModel.getAccount(referenceId);
    if (!account) return null;
    const ledger = (await ledgerModel.getLedgerEntries(referenceId)).map((entry) => ({
      ...entry,
      accountName: account.name,
    }));
    return { type: "account", account, ledgerEntries: ledger };
  }

  if (type === "receipt" || type === "payment") {
    const voucher = await ledgerModel.getReceiptVoucher(referenceId);
    if (!voucher) return null;
    const ledger = db
      .select({
        id: ledgerEntries.id,
        entryDate: ledgerEntries.entryDate,
        transactionType: ledgerEntries.transactionType,
        amount: ledgerEntries.amount,
        description: ledgerEntries.description,
        saleId: ledgerEntries.saleId,
        purchaseId: ledgerEntries.purchaseId,
        receiptVoucherId: ledgerEntries.receiptVoucherId,
        journalVoucherId: ledgerEntries.journalVoucherId,
        contraVoucherId: ledgerEntries.contraVoucherId,
        expenseEntryId: ledgerEntries.expenseEntryId,
        accountId: ledgerEntries.accountId,
        accountName: accounts.name,
      })
      .from(ledgerEntries)
      .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(buildLedgerReferenceWhere(type, referenceId) as any)
      .orderBy(ledgerEntries.entryDate)
      .all()
      .map((le) => ({
        ...le,
        ...getLedgerReferenceFromValues(le as any),
        debit: le.transactionType === "debit" ? le.amount : "0",
        credit: le.transactionType === "credit" ? le.amount : "0",
      }));
    return { type, voucher, ledgerEntries: ledger };
  }

  if (type === "journal_voucher") {
    const voucher = await jvModel.getJournalVoucher(referenceId);
    if (!voucher) return null;
    const ledger = db
      .select({
        id: ledgerEntries.id,
        entryDate: ledgerEntries.entryDate,
        transactionType: ledgerEntries.transactionType,
        amount: ledgerEntries.amount,
        description: ledgerEntries.description,
        saleId: ledgerEntries.saleId,
        purchaseId: ledgerEntries.purchaseId,
        receiptVoucherId: ledgerEntries.receiptVoucherId,
        journalVoucherId: ledgerEntries.journalVoucherId,
        contraVoucherId: ledgerEntries.contraVoucherId,
        expenseEntryId: ledgerEntries.expenseEntryId,
        accountId: ledgerEntries.accountId,
        accountName: accounts.name,
      })
      .from(ledgerEntries)
      .leftJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(buildLedgerReferenceWhere("journal_voucher", referenceId) as any)
      .orderBy(ledgerEntries.entryDate)
      .all()
      .map((le) => ({
        ...le,
        ...getLedgerReferenceFromValues(le as any),
        debit: le.transactionType === "debit" ? le.amount : "0",
        credit: le.transactionType === "credit" ? le.amount : "0",
      }));
    return { type: "journal_voucher", voucher, ledgerEntries: ledger };
  }

  return null;
}
