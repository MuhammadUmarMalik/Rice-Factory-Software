/**
 * Ledger posting core, extracted from the private methods of DatabaseStorage.
 *
 * purchases.model and sales.model both post double-entry lines, ensure system
 * accounts exist and compute tax, so those helpers had to come out of the class
 * before either document type could move. Everything here takes an explicit
 * client because every caller runs inside its own transaction.
 */
import { db, sqlite } from "./db";
import { eq, and, or, sql, asc, desc, lt, lte, gte, isNull, inArray } from "drizzle-orm";
import {
  accounts,
  ledgerEntries,
  cashTransactions,
  taxTypes,
  taxRates,
  sales,
  saleItems,
  purchases,
  purchaseItems,
  purchaseCharges,
  products,
  receiptVouchers,
  receiptVoucherLines,
  contraVouchers,
  contraVoucherLines,
  expenseEntries,
  journalVouchers,
  type Account,
  type PurchaseCharge,
  type LedgerEntry,
  type InsertLedgerEntry,
  type CashTransaction,
  type InsertCashTransaction,
  type ReceiptVoucher,
  type InsertReceiptVoucher,
  type ReceiptVoucherLine,
  type InsertReceiptVoucherLine,
} from "../db/schema";
import { parseAmount, roundMoney } from "../utils/parse";
import { endOfDay } from "../utils/dates";
import { assertPostingAllowed } from "../services/posting-guard.service";
import {
  buildPaymentVoucherNarration as buildPaymentVoucherNarrationText,
  buildPurchaseNarration as buildPurchaseNarrationText,
  buildReceiptVoucherNarration as buildReceiptVoucherNarrationText,
  buildSaleNarration as buildSaleNarrationText,
  cleanNarrationSegment,
  firstMeaningfulNarration,
  joinNarration,
  preferManualNarration,
} from "../utils/narration";
import { nextDocumentSequence } from "./sequences.model";
import * as accountsModel from "./accounts.model";
import { normalSideForAccountType, recomputeAccountBalances } from "./accounts.model";
import * as payrollModel from "./payroll.model";

function normalizeReceiptVoucherType(value?: string | null): "CR" | "CP" | "BR" | "BP" {
  const v = (value || "CR").toString().trim().toUpperCase();
  if (v === "CR" || v === "CP" || v === "BR" || v === "BP") return v;
  if (v === "RECEIPT" || v === "CRV") return "CR";
  if (v === "BRV") return "BR";
  if (v === "PAYMENT" || v === "CPV" || v === "DR") return "CP";
  if (v === "BPV") return "BP";
  return "CR";
}

function resolveReceiptLineAmount(line: ReceiptLineInput & { amount?: string | number | null }): number {
  const debitValue = parseAmount(line.debit || "0");
  const creditValue = parseAmount(line.credit || "0");
  const amountValue = line.amount != null ? parseAmount(line.amount) : 0;
  return Math.max(debitValue, creditValue, amountValue);
}

export type ReceiptLineInput = Omit<InsertReceiptVoucherLine, "id" | "voucherId">;

export type LedgerReportRow = {
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

export type LedgerReport = {
  account: Account;
  openingBalance: string;
  rows: LedgerReportRow[];
  totals: { debit: string; credit: string; closingBalance: string };
  validation: { closingMatchesLastRow: boolean; closingMatchesTotals: boolean };
};

type DbClient = typeof db;

export type CashTxInput = Omit<
  InsertCashTransaction,
  "id" | "createdAt" | "referenceType" | "referenceId"
> &
  Partial<
    Pick<
      InsertCashTransaction,
      "journalVoucherId" | "receiptVoucherId" | "contraVoucherId" | "expenseEntryId"
    >
  >;

export function normalizeLedgerReferenceType(
  value?: string | null,
): "sale" | "purchase" | "receipt_voucher" | "journal_voucher" | "contra_voucher" | "expense" | null {
  const v = (value || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "sale") return "sale";
  if (v === "purchase") return "purchase";
  if (v === "receipt_voucher" || v === "receipt" || v === "payment" || v === "cr" || v === "cp" || v === "br" || v === "bp") return "receipt_voucher";
  if (v === "journal_voucher" || v === "journal" || v === "jv") return "journal_voucher";
  if (v === "contra_voucher" || v === "contra" || v === "cv") return "contra_voucher";
  if (v === "expense" || v === "expense_entry") return "expense";
  return null;
}

export function getLedgerReference(entry: LedgerEntry): { referenceType: string | null; referenceId: number | null } {
  if (entry.saleId) return { referenceType: "sale", referenceId: entry.saleId };
  if (entry.purchaseId) return { referenceType: "purchase", referenceId: entry.purchaseId };
  if (entry.receiptVoucherId) return { referenceType: "receipt_voucher", referenceId: entry.receiptVoucherId };
  if (entry.journalVoucherId) return { referenceType: "journal_voucher", referenceId: entry.journalVoucherId };
  if (entry.contraVoucherId) return { referenceType: "contra_voucher", referenceId: entry.contraVoucherId };
  if (entry.expenseEntryId) return { referenceType: "expense", referenceId: entry.expenseEntryId };
  return { referenceType: null, referenceId: null };
}

export function getCashReferenceColumns(
  referenceType?: string | null,
  referenceId?: number | null,
): Partial<InsertCashTransaction> {
  const id = referenceId != null ? Number(referenceId) : null;
  if (!id) return {};
  const normalized = normalizeLedgerReferenceType(referenceType);
  if (normalized === "receipt_voucher") return { receiptVoucherId: id };
  if (normalized === "journal_voucher") return { journalVoucherId: id };
  if (normalized === "contra_voucher") return { contraVoucherId: id };
  if (normalized === "expense") return { expenseEntryId: id };
  return {};
}

export function applyAccountBalance(
  client: DbClient,
  account: Account,
  transactionType: "debit" | "credit",
  amount: number,
): number {
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

export function postLedgerEntry(client: DbClient, entry: Omit<InsertLedgerEntry, "balance">): LedgerEntry {
  const [account] = client.select().from(accounts).where(eq(accounts.id, entry.accountId)).all();
  if (!account) throw new Error(`Account not found (${entry.accountId})`);
  const amount = parseAmount(entry.amount || "0");
  const newBalance = applyAccountBalance(client, account as any, entry.transactionType as any, amount);

  const newEntry = client.insert(ledgerEntries).values({
    ...entry,
    balance: newBalance.toString(),
  }).returning().get();

  // Auto record cash movement for system Cash in Hand
  if (account.isSystemAccount && account.name === "Cash in Hand") {
    const ref = getLedgerReference(newEntry as LedgerEntry);
    const cashCols = getCashReferenceColumns(ref.referenceType, ref.referenceId) as any;
    const txObj: CashTxInput = {
      accountId: account.id,
      transactionType: entry.transactionType === "debit" ? "DEBIT" : "CREDIT",
      transactionDate: entry.entryDate || new Date(),
      ...cashCols,
      amount: entry.amount,
      narration: entry.description,
    };
    client.insert(cashTransactions).values(txObj).run();
  }

  return newEntry as any;
}

export function postBalancedLedgerEntries(
  client: DbClient,
  entries: Omit<InsertLedgerEntry, "balance">[],
  context: string,
) {
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
    postLedgerEntry(client, entry);
  }
}

export function ensureSystemAccount(
  client: DbClient,
  name: string,
  type: Account["type"] | string,
): Account {
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

export function ensureCashAccount(client: DbClient): Account {
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

export function ensurePurchaseChargeAccount(client: DbClient, type: string): Account {
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
  return ensureSystemAccount(client, label, "expense");
}

export function ensureSalesChargeAccount(
  client: DbClient,
  label: "LOADING" | "WEIGHING" | "OTHER" | "RENT",
): Account {
  const name = (() => {
    switch (label) {
      case "LOADING":
        return "Sales - Loading Charges";
      case "WEIGHING":
        return "Sales - Weighing Charges";
      case "OTHER":
        return "Sales - Other Charges";
      case "RENT":
        return "Sales - Rent Charges";
      default:
        return "Sales - Other Charges";
    }
  })();
  return ensureSystemAccount(client, name, "income");
}

export function calculateTaxAmount(
  client: DbClient,
  taxTypeId: number | null | undefined,
  taxableBase: number,
  postingDate: Date,
  direction: "sales" | "purchases",
): number {
  if (!taxTypeId) return 0;
  const [taxType] = client.select().from(taxTypes).where(eq(taxTypes.id, taxTypeId)).all();
  if (!taxType || (taxType.direction !== "both" && taxType.direction !== direction)) {
    throw new Error(`Invalid tax type for ${direction}`);
  }
  const [rate] = client.select().from(taxRates).where(and(
    eq(taxRates.taxTypeId, taxTypeId),
    eq(taxRates.isActive, true as any),
    lte(taxRates.effectiveFrom, postingDate),
    or(isNull(taxRates.effectiveTo), gte(taxRates.effectiveTo, postingDate)),
  )).orderBy(desc(taxRates.effectiveFrom)).limit(1).all();
  if (!rate) throw new Error(`No effective tax rate configured for ${direction}`);
  return Math.round(Math.max(taxableBase, 0) * parseAmount(rate.ratePercent)) / 100;
}

/**
 * Remove a daybook projection row for a source record that is being deleted.
 * The daybook tables are optional (created lazily by daybooks.service), so a
 * missing table is not an error.
 */
export function deleteDaybookProjection(table: string, linkColumn: string, sourceId: number) {
  try {
    const exists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
      .get(table) as any;
    if (!exists?.name) return;
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!cols.some((c) => c.name === linkColumn)) return;
    sqlite.prepare(`DELETE FROM ${table} WHERE ${linkColumn} = ?`).run(sourceId);
  } catch (error) {
    console.error(`Failed to clear ${table}.${linkColumn} projection for ${sourceId}`, error);
  }
}

export function getLedgerReferenceColumns(referenceType?: string | null, referenceId?: number | null): Partial<InsertLedgerEntry> {
  const id = referenceId != null ? Number(referenceId) : null;
  if (!id) return {};
  const normalized = normalizeLedgerReferenceType(referenceType);
  if (normalized === "sale") return { saleId: id };
  if (normalized === "purchase") return { purchaseId: id };
  if (normalized === "receipt_voucher") return { receiptVoucherId: id };
  if (normalized === "journal_voucher") return { journalVoucherId: id };
  if (normalized === "contra_voucher") return { contraVoucherId: id };
  if (normalized === "expense") return { expenseEntryId: id };
  return {};
}

export function buildLedgerReferenceWhere(referenceType?: string | null, referenceId?: number | null) {
  const normalized = normalizeLedgerReferenceType(referenceType);
  const id = referenceId != null ? Number(referenceId) : null;
  if (!normalized) return undefined;
  if (normalized === "sale") return id ? eq(ledgerEntries.saleId, id) : sql`${ledgerEntries.saleId} IS NOT NULL`;
  if (normalized === "purchase") return id ? eq(ledgerEntries.purchaseId, id) : sql`${ledgerEntries.purchaseId} IS NOT NULL`;
  if (normalized === "receipt_voucher") return id ? eq(ledgerEntries.receiptVoucherId, id) : sql`${ledgerEntries.receiptVoucherId} IS NOT NULL`;
  if (normalized === "journal_voucher") return id ? eq(ledgerEntries.journalVoucherId, id) : sql`${ledgerEntries.journalVoucherId} IS NOT NULL`;
  if (normalized === "contra_voucher") return id ? eq(ledgerEntries.contraVoucherId, id) : sql`${ledgerEntries.contraVoucherId} IS NOT NULL`;
  if (normalized === "expense") return id ? eq(ledgerEntries.expenseEntryId, id) : sql`${ledgerEntries.expenseEntryId} IS NOT NULL`;
  return undefined;
}

// --- Ledger reporting and cash movement (from the "// Ledger" section) ---

// Ledger
export async function getLedgerReport(params: {
  accountId: number;
  referenceType?: string;
  startDate?: Date;
  endDate?: Date;
  narration?: string;
}): Promise<LedgerReport> {
  const { accountId, referenceType, startDate, endDate, narration } = params;
  const account = await accountsModel.getAccount(accountId);
  if (!account) {
    throw new Error("Account not found");
  }

  const normalSide = normalSideForAccountType(account?.type);
  const resolveOpeningBalance = async () => {
    let opening = parseAmount(account.openingBalance || "0");
    if (startDate) {
      const movementWhere = [eq(ledgerEntries.accountId, accountId), lt(ledgerEntries.entryDate, startDate)];
      if (referenceType) movementWhere.push(buildLedgerReferenceWhere(referenceType, null) as any);
      const rawMovements = db
        .select()
        .from(ledgerEntries)
        .where(and(...(movementWhere as any)))
        .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
        .all() as LedgerEntry[];
      const movements = await filterExistingSourceLedgerEntries(rawMovements);
      const delta = movements.reduce((sum, row) => {
        const amount = parseAmount(row.amount);
        if (normalSide === "DEBIT") {
          return sum + (row.transactionType === "debit" ? amount : -amount);
        }
        return sum + (row.transactionType === "credit" ? amount : -amount);
      }, 0);
      opening += delta;
    }
    return opening;
  };
  const entriesBase = await getLedgerEntries(accountId, referenceType, startDate, endDate);
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
      { key: "rent", label: "RENT" },
    ];

    const detailLabels = new Set([
      "TAX",
      "BROKER COMMISSION",
      "LOADING",
      "WEIGHING",
      "OTHER",
      "RENT",
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
      const ref = getLedgerReference(entry as any);
      if (!ref.referenceType || !ref.referenceId) continue;
      const key = `${ref.referenceType}:${ref.referenceId}`;
      const list = byRef.get(key) || [];
      list.push(entry);
      byRef.set(key, list);
    }

    const purchaseIds = expandPurchase
      ? Array.from(new Set(entriesBase.filter((e) => getLedgerReference(e as any).referenceType === "purchase").map((e) => getLedgerReference(e as any).referenceId).filter(Boolean) as number[]))
      : [];
    const saleIds = expandSale
      ? Array.from(new Set(entriesBase.filter((e) => getLedgerReference(e as any).referenceType === "sale").map((e) => getLedgerReference(e as any).referenceId).filter(Boolean) as number[]))
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
      { invoiceNumber?: string | null; saleDate?: Date | null; taxAmount?: string | null; loadingCharges?: string | null; weighingCharges?: string | null; otherCharges?: string | null; rentCharges?: string | null; discountAmount?: string | null }
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
              rentCharges: sales.rentCharges,
              discountAmount: sales.discountAmount,
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
        ...getLedgerReferenceColumns(args.refType, args.refId),
        debit: args.transactionType === "debit" ? amount.toString() : "0",
        credit: args.transactionType === "credit" ? amount.toString() : "0",
      } as LedgerEntry & { debit?: string; credit?: string };
    };

    const result: typeof entriesBase = [];
    const processed = new Set<string>();
    for (const entry of entriesBase) {
      const ref = getLedgerReference(entry as any);
      if (!ref.referenceType || !ref.referenceId) {
        result.push(entry);
        continue;
      }
      const refType = ref.referenceType as string;
      const refId = ref.referenceId as number;
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
          { label: saleChargeLabels[3].label, amount: parseAmount(meta?.rentCharges || "0") },
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
    : await resolveOpeningBalance();

  const narrationFilterRaw = (narration || "").trim().toLowerCase();
  const narrationTokens = narrationFilterRaw
    ? narrationFilterRaw.split(/[,|\s]+/).map((t) => t.trim()).filter(Boolean)
    : [];
  const matchesNarration = (value: string) => {
    if (narrationTokens.length === 0) return true;
    const haystack = value.toLowerCase();
    return narrationTokens.some((token) => haystack.includes(token));
  };
  // Enriched narration is built below from linked vouchers and accounts, so
  // filtering must happen after that enrichment rather than on raw descriptions.
  const filteredEntries = entries;

  const byType = filteredEntries.reduce(
    (acc, e) => {
      const ref = getLedgerReference(e as any);
      if (!ref.referenceType || !ref.referenceId) return acc;
      const list = acc[ref.referenceType] || [];
      list.push(ref.referenceId as number);
      acc[ref.referenceType] = list;
      return acc;
    },
    {} as Record<string, number[]>,
  );

  const uniqueIds = (list?: number[]) => Array.from(new Set(list || []));
  const purchaseIds = uniqueIds(byType.purchase);
  const saleIds = uniqueIds(byType.sale);
  const receiptIds = uniqueIds(byType.receipt_voucher);
  const journalIds = uniqueIds(byType.journal_voucher);
  const expenseIds = uniqueIds(byType.expense);
  const contraIds = uniqueIds(byType.contra);

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
      partyName?: string | null;
      notes?: string | null;
      supplierId?: number | null;
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
            partyName: accounts.name,
            notes: purchases.notes,
            supplierId: purchases.supplierId,
          })
          .from(purchases)
          .leftJoin(accounts, eq(purchases.supplierId, accounts.id))
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
  const saleMetaById = new Map<number, {
    invoiceNumber?: string | null;
    subtotal?: string | null;
    totalAmount?: string | null;
    partyName?: string | null;
    notes?: string | null;
  }>(
    saleIds.length
      ? db
          .select({
            id: sales.id,
            invoiceNumber: sales.invoiceNumber,
            subtotal: sales.subtotal,
            totalAmount: sales.totalAmount,
            partyName: accounts.name,
            notes: sales.notes,
          })
          .from(sales)
          .leftJoin(accounts, eq(sales.customerId, accounts.id))
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
  const receiptMetaById = new Map<number, {
    no: string;
    voucherType: string;
    settlementAccountId: number | null;
    narration: string;
  }>(
    receiptIds.length
      ? db
          .select({
            id: receiptVouchers.id,
            no: receiptVouchers.voucherNumber,
            voucherType: receiptVouchers.voucherType,
            settlementAccountId: receiptVouchers.settlementAccountId,
            narration: receiptVouchers.narration,
          })
          .from(receiptVouchers)
          .where(inArray(receiptVouchers.id, receiptIds))
          .all()
          .map((r) => [r.id, {
            no: r.no,
            voucherType: r.voucherType,
            settlementAccountId: r.settlementAccountId ?? null,
            narration: r.narration || "",
          }])
      : [],
  );
  const receiptLineRows = receiptIds.length
    ? db
        .select({
          voucherId: receiptVoucherLines.voucherId,
          accountId: receiptVoucherLines.accountId,
          accountName: accounts.name,
          narration: receiptVoucherLines.narration,
          saleId: receiptVoucherLines.saleId,
          purchaseId: receiptVoucherLines.purchaseId,
        })
        .from(receiptVoucherLines)
        .leftJoin(accounts, eq(receiptVoucherLines.accountId, accounts.id))
        .where(inArray(receiptVoucherLines.voucherId, receiptIds))
        .all()
    : [];
  const receiptLinesByVoucherId = new Map<number, typeof receiptLineRows>();
  for (const line of receiptLineRows) {
    const list = receiptLinesByVoucherId.get(line.voucherId) || [];
    list.push(line);
    receiptLinesByVoucherId.set(line.voucherId, list);
  }
  const linkedSaleIds = uniqueIds(receiptLineRows.map((line) => line.saleId).filter((id): id is number => id !== null));
  if (linkedSaleIds.length) {
    for (const row of db
      .select({ id: sales.id, no: sales.invoiceNumber })
      .from(sales)
      .where(inArray(sales.id, linkedSaleIds))
      .all()) {
      saleNoById.set(row.id, row.no);
    }
  }
  const linkedPurchaseIds = uniqueIds(receiptLineRows.map((line) => line.purchaseId).filter((id): id is number => id !== null));
  if (linkedPurchaseIds.length) {
    for (const row of db
      .select({ id: purchases.id, no: purchases.invoiceNumber })
      .from(purchases)
      .where(inArray(purchases.id, linkedPurchaseIds))
      .all()) {
      purchaseNoById.set(row.id, row.no);
    }
  }
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
  const contraMetaById = new Map<number, { no: string; narration: string }>(
    contraIds.length
      ? db
          .select({ id: contraVouchers.id, no: contraVouchers.voucherNo, narration: contraVouchers.narration })
          .from(contraVouchers)
          .where(inArray(contraVouchers.id, contraIds))
          .all()
          .map((row) => [row.id, { no: row.no, narration: row.narration || "" }])
      : [],
  );
  const contraAccountNamesById = new Map<number, string[]>();
  if (contraIds.length) {
    const rows = db
      .select({ contraId: contraVoucherLines.contraVoucherId, accountName: accounts.name })
      .from(contraVoucherLines)
      .leftJoin(accounts, eq(contraVoucherLines.accountId, accounts.id))
      .where(inArray(contraVoucherLines.contraVoucherId, contraIds))
      .all();
    for (const row of rows) {
      if (!row.accountName) continue;
      const names = contraAccountNamesById.get(row.contraId) || [];
      if (!names.includes(row.accountName)) names.push(row.accountName);
      contraAccountNamesById.set(row.contraId, names);
    }
  }
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
  const resolveVoucher = (refType?: string | null, refId?: number | null) => {
    if (!refType || !refId) return { vchType: "-", vchNo: "-" };
    if (refType === "purchase") return { vchType: "Purchase", vchNo: purchaseNoById.get(refId) || `PUR-${refId}` };
    if (refType === "sale") return { vchType: "Sale", vchNo: saleNoById.get(refId) || `SAL-${refId}` };
    if (refType === "journal_voucher") return { vchType: "JV", vchNo: journalNoById.get(refId) || `JV-${refId}` };
    if (refType === "receipt_voucher") {
      const meta = receiptMetaById.get(refId);
      const settlementType = meta?.settlementAccountId ? settlementTypeById.get(meta.settlementAccountId) : undefined;
      const isBank = settlementType === "bank";
      const isReceipt = meta?.voucherType === "CR" || meta?.voucherType === "BR";
      const vchType = isReceipt ? (isBank ? "BRV" : "CRV") : (isBank ? "BPV" : "CPV");
      return { vchType, vchNo: meta?.no || `${vchType}-${refId}` };
    }
    if (refType === "expense") return { vchType: "EXP", vchNo: `EXP-${refId}` };
    if (refType === "contra_voucher") {
      const meta = contraMetaById.get(refId);
      return { vchType: "CV", vchNo: meta?.no || `CV-${refId}` };
    }
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
    if (refId && meta && !cleanNarrationSegment(meta.notes)) return "-";
    const invoice = meta?.invoiceNumber || (refId ? purchaseNoById.get(refId) : "") || (refId ? `PUR-${refId}` : "");
    const base = buildPurchaseNarrationText({
      notes: meta?.notes,
      supplierName: meta?.partyName,
      invoiceNumber: invoice,
    });
    const itemLabel = refId ? purchaseItemNameById.get(refId) : "";
    const itemTotals = refId ? purchaseItemTotals.get(refId) : undefined;
    const netKg = itemTotals?.netKg ?? parseAmount(meta?.totalNetWeightKg || "0");
    const moundQty = netKg > 0 ? netKg / 40 : (itemTotals?.moundQty ?? parseAmount(meta?.totalMoundQty || "0"));
    const subtotal = parseAmount(meta?.itemsSubtotal || meta?.subtotal || "0");
    const qtyParts = [];
    const parts: unknown[] = [base];
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
    if (lowerDescription.includes("reversal")) {
      return rawDescription;
    }
    if (lowerDescription.includes("tax")) {
      parts.push(amountLabel > 0 ? `Tax: ${formatMoney(amountLabel)}` : "Tax");
    } else if (lowerDescription.includes("charge") || isKnownChargeLabel(rawDescription)) {
      const label = normalizeChargeLabel(rawDescription);
      parts.push(amountLabel > 0 ? `${label}: ${formatMoney(amountLabel)}` : label);
    } else if (lowerDescription.includes("broker commission") || lowerDescription.includes("brokerage")) {
      parts.push(amountLabel > 0 ? `Broker commission: ${formatMoney(amountLabel)}` : "Broker commission");
    } else if (lowerDescription.includes("purchase")) {
      parts.push(entry.accountId === meta?.supplierId ? "Supplier Payable" : "Inventory");
    } else if (rawDescription) {
      parts.push(rawDescription);
    }
    return joinNarration(parts);
  };

  const buildSaleNarration = (entry: LedgerEntry, refId?: number | null) => {
    const rawDescription = (entry.description || "").trim();
    const lowerDescription = rawDescription.toLowerCase();
    const meta = refId ? saleMetaById.get(refId) : undefined;
    if (refId && meta && !cleanNarrationSegment(meta.notes)) return "-";
    const invoice = meta?.invoiceNumber || (refId ? saleNoById.get(refId) : "") || (refId ? `SAL-${refId}` : "");
    const base = buildSaleNarrationText({
      notes: meta?.notes,
      customerName: meta?.partyName,
      invoiceNumber: invoice,
    });
    const itemLabel = refId ? saleItemNameById.get(refId) : "";
    const qtyMeta = refId ? saleQtyById.get(refId) : undefined;
    const subtotal = parseAmount(meta?.subtotal || "0");
    const parts: unknown[] = [base];
    const amountLabel = parseAmount(entry.amount || "0");
    if (itemLabel) parts.push(itemLabel);
    if (qtyMeta && qtyMeta.totalQty > 0) {
      parts.push(`${formatQty(qtyMeta.totalQty)} ${qtyMeta.unit || "units"}`.trim());
      if (subtotal > 0) {
        const rateBase = subtotal / Math.max(qtyMeta.totalQty, 1);
        parts.push(`RATE ${formatRate(rateBase)}`);
      }
    }
    if (lowerDescription.includes("reversal")) {
      return rawDescription;
    }
    if (lowerDescription.includes("tax")) {
      parts.push(amountLabel > 0 ? `Tax: ${formatMoney(amountLabel)}` : "Tax");
    } else if (lowerDescription.includes("charge") || isKnownChargeLabel(rawDescription)) {
      const label = normalizeChargeLabel(rawDescription);
      parts.push(amountLabel > 0 ? `${label}: ${formatMoney(amountLabel)}` : label);
    } else if (lowerDescription.includes("cogs")) {
      parts.push("COGS");
    } else if (lowerDescription.includes("inventory")) {
      parts.push("Inventory");
    } else if (lowerDescription.includes("sale")) {
      parts.push("Revenue");
    } else if (rawDescription) {
      parts.push(rawDescription);
    }
    return joinNarration(parts);
  };

  const buildReceiptNarration = (refId?: number | null) => {
    if (!refId) return "RECEIPT";
    const meta = receiptMetaById.get(refId);
    const settlementId = meta?.settlementAccountId || undefined;
    const lines = (receiptLinesByVoucherId.get(refId) || []).filter((line) => line.accountId !== settlementId);
    return firstMeaningfulNarration([meta?.narration, ...lines.map((line) => line.narration)]) || "-";
  };

  const buildPaymentNarration = (refId?: number | null) => {
    if (!refId) return "PAYMENT";
    const meta = receiptMetaById.get(refId);
    const settlementId = meta?.settlementAccountId || undefined;
    const lines = (receiptLinesByVoucherId.get(refId) || []).filter((line) => line.accountId !== settlementId);
    return firstMeaningfulNarration([meta?.narration, ...lines.map((line) => line.narration)]) || "-";
  };

  const buildJournalNarration = (refId?: number | null) => {
    if (!refId) return "JV";
    const note = journalNarrationById.get(refId) || "";
    return note || "-";
  };

  const buildExpenseNarration = (refId?: number | null) => {
    if (!refId) return "EXP";
    const meta = expenseMetaById.get(refId);
    return meta?.description || "-";
  };

  const buildContraNarration = (refId?: number | null) => {
    if (!refId) return "CONTRA";
    const meta = contraMetaById.get(refId);
    const vch = meta?.no || `CV-${refId}`;
    const accountNames = contraAccountNamesById.get(refId) || [];
    const transfer = accountNames.length ? accountNames.join(" → ") : "";
    return [
      `Contra ${vch}`,
      transfer ? `Transfer: ${transfer}` : "",
      meta?.narration ? `Note: ${meta.narration}` : "",
    ].filter(Boolean).join(" | ");
  };

  let running = openingBalance;
  const rows: LedgerReportRow[] = [];
  for (const entry of filteredEntries) {
    const debit = parseAmount(entry.debit || "0");
    const credit = parseAmount(entry.credit || "0");
    const delta = normalSide === "DEBIT" ? debit - credit : credit - debit;
    running += delta;
    const ref = getLedgerReference(entry as any);
    const voucher = resolveVoucher(ref.referenceType, ref.referenceId);

    let narration = cleanNarrationSegment(entry.description) || "-";
    if (ref.referenceType === "purchase") {
      narration = buildPurchaseNarration(entry, ref.referenceId as any);
    } else if (ref.referenceType === "sale") {
      narration = buildSaleNarration(entry, ref.referenceId as any);
    } else if (ref.referenceType === "receipt_voucher") {
      const voucherType = ref.referenceId ? receiptMetaById.get(ref.referenceId)?.voucherType : undefined;
      narration = voucherType === "CR" || voucherType === "BR"
        ? buildReceiptNarration(ref.referenceId as any)
        : buildPaymentNarration(ref.referenceId as any);
    } else if (ref.referenceType === "journal_voucher") {
      narration = buildJournalNarration(ref.referenceId as any);
    } else if (ref.referenceType === "expense") {
      narration = buildExpenseNarration(ref.referenceId as any);
    } else if (ref.referenceType === "contra_voucher") {
      narration = buildContraNarration(ref.referenceId as any);
    }
    narration = cleanNarrationSegment(narration) || "-";

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
      referenceType: ref.referenceType,
      referenceId: ref.referenceId,
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

export async function getLedgerEntries(
    accountId?: number,
    referenceType?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<(LedgerEntry & { runningBalance?: string; debit?: string; credit?: string; openingBalance?: string })[]> {
  const whereClauses = [];
  if (accountId) whereClauses.push(eq(ledgerEntries.accountId, accountId));
  if (referenceType) whereClauses.push(buildLedgerReferenceWhere(referenceType, null) as any);
  if (startDate) whereClauses.push(gte(ledgerEntries.entryDate, startDate));
  if (endDate) whereClauses.push(lte(ledgerEntries.entryDate, endOfDay(endDate)));

    const rowsRaw = whereClauses.length
      ? db.select().from(ledgerEntries).where(and(...whereClauses as any)).orderBy(ledgerEntries.entryDate, ledgerEntries.id).all()
      : db.select().from(ledgerEntries).orderBy(ledgerEntries.entryDate, ledgerEntries.id).all();
    const rowsBase = await filterExistingSourceLedgerEntries(rowsRaw as LedgerEntry[]);

  if (!accountId) {
    return rowsBase;
  }

  const [account] = db.select().from(accounts).where(eq(accounts.id, accountId)).all();
  const normalSide = normalSideForAccountType(account?.type);

  let opening = parseAmount(account?.openingBalance || "0");
  if (startDate) {
    const movementWhere = [eq(ledgerEntries.accountId, accountId), lt(ledgerEntries.entryDate, startDate)];
    if (referenceType) movementWhere.push(buildLedgerReferenceWhere(referenceType, null) as any);

    const movementRaw = db
      .select()
      .from(ledgerEntries)
      .where(and(...(movementWhere as any)))
      .orderBy(ledgerEntries.entryDate, ledgerEntries.id)
      .all() as LedgerEntry[];
    const movementRows = await filterExistingSourceLedgerEntries(movementRaw);
    const delta = movementRows.reduce((sum, row) => {
      const amount = parseAmount(row.amount);
      if (normalSide === "DEBIT") {
        return sum + (row.transactionType === "debit" ? amount : -amount);
      }
      return sum + (row.transactionType === "credit" ? amount : -amount);
    }, 0);
    opening += delta;
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

export function createLedgerEntryInternal(client: DbClient, entry: InsertLedgerEntry): Promise<LedgerEntry> {
  return Promise.resolve(postLedgerEntry(client, entry));
}

export async function createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry> {
  return createLedgerEntryInternal(db, entry);
}

export async function getOrCreateCashAccount(): Promise<Account> {
  return ensureCashAccount(db);
}

export async function recordCashTransaction(tx: CashTxInput): Promise<CashTransaction> {
  await ensureCashAccount(db);
  const created = db.insert(cashTransactions).values(tx).returning().get();
  return created as any;
}

export async function getCashSummary(): Promise<{ opening: number; debit: number; credit: number; closing: number }> {
  const cash = await ensureCashAccount(db);
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

export async function getCashTransactions(): Promise<CashTransaction[]> {
  const cash = await ensureCashAccount(db);
  return db.select().from(cashTransactions).where(eq(cashTransactions.accountId, cash.id)).orderBy(desc(cashTransactions.transactionDate)).all();
}


export async function filterExistingSourceLedgerEntries(rows: LedgerEntry[]): Promise<LedgerEntry[]> {
  if (!rows.length) return rows;

  const idsByType = rows.reduce(
    (acc, row) => {
      const ref = getLedgerReference(row);
      if (!ref.referenceType || !ref.referenceId) return acc;
      const list = acc[ref.referenceType] || [];
      list.push(ref.referenceId);
      acc[ref.referenceType] = list;
      return acc;
    },
    {} as Record<string, number[]>,
  );

  const unique = (list?: number[]) => Array.from(new Set((list || []).filter((id) => Number.isFinite(id))));
  const saleIds = unique(idsByType.sale);
  const purchaseIds = unique(idsByType.purchase);
  const receiptIds = unique(idsByType.receipt_voucher);
  const journalIds = unique(idsByType.journal_voucher);
  const contraIds = unique(idsByType.contra_voucher);
  const expenseIds = unique(idsByType.expense);

  const existingSales = new Set<number>(
    saleIds.length
      ? db.select({ id: sales.id }).from(sales).where(inArray(sales.id, saleIds)).all().map((r) => r.id)
      : [],
  );
  const existingPurchases = new Set<number>(
    purchaseIds.length
      ? db
          .select({ id: purchases.id })
          .from(purchases)
          .where(and(inArray(purchases.id, purchaseIds), isNull(purchases.deletedAt)))
          .all()
          .map((r) => r.id)
      : [],
  );
  const existingReceipts = new Set<number>(
    receiptIds.length
      ? db
          .select({ id: receiptVouchers.id })
          .from(receiptVouchers)
          .where(and(inArray(receiptVouchers.id, receiptIds), isNull(receiptVouchers.deletedAt)))
          .all()
          .map((r) => r.id)
      : [],
  );
  const existingJournals = new Set<number>(
    journalIds.length
      ? db.select({ id: journalVouchers.id }).from(journalVouchers).where(inArray(journalVouchers.id, journalIds)).all().map((r) => r.id)
      : [],
  );
  const existingContras = new Set<number>(
    contraIds.length
      ? db.select({ id: contraVouchers.id }).from(contraVouchers).where(inArray(contraVouchers.id, contraIds)).all().map((r) => r.id)
      : [],
  );
  const existingExpenses = new Set<number>(
    expenseIds.length
      ? db.select({ id: expenseEntries.id }).from(expenseEntries).where(inArray(expenseEntries.id, expenseIds)).all().map((r) => r.id)
      : [],
  );

  return rows.filter((row) => {
    const ref = getLedgerReference(row);
    if (!ref.referenceType || !ref.referenceId) return true;
    if (ref.referenceType === "sale") return existingSales.has(ref.referenceId);
    if (ref.referenceType === "purchase") return existingPurchases.has(ref.referenceId);
    if (ref.referenceType === "receipt_voucher") return existingReceipts.has(ref.referenceId);
    if (ref.referenceType === "journal_voucher") return existingJournals.has(ref.referenceId);
    if (ref.referenceType === "contra_voucher") return existingContras.has(ref.referenceId);
    if (ref.referenceType === "expense") return existingExpenses.has(ref.referenceId);
    return true;
  });
}

// --- Receipt/payment vouchers (from the "// Cash Receipts" section) ---

// Cash Receipt Vouchers
export async function getReceiptVouchers(): Promise<(ReceiptVoucher & { lines?: ReceiptVoucherLine[]; primaryAccountName?: string })[]> {
  const vouchers = db.select().from(receiptVouchers).where(isNull(receiptVouchers.deletedAt)).orderBy(desc(receiptVouchers.id)).all();
  const lines = db.select().from(receiptVoucherLines).all();
  const accountsList = await accountsModel.getAccounts();
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

/**
 * Vouchers with their lines in one join, optionally filtered by type.
 *
 * payments.service.ts and receipts.service.ts used to list vouchers and then
 * call getReceiptVoucher() once per row — an extra query per voucher on every
 * page load. This does the same work in a single query and groups the lines in
 * application code.
 */
export async function getReceiptVouchersWithLines(
  voucherType?: "CR" | "CP" | "BR" | "BP",
): Promise<(ReceiptVoucher & { lines: ReceiptVoucherLine[]; primaryAccountName: string })[]> {
  const conditions = [isNull(receiptVouchers.deletedAt)];
  if (voucherType) conditions.push(eq(receiptVouchers.voucherType, voucherType));

  // Left join so a voucher with no lines is still returned (matching the old
  // behaviour, where such a voucher came back with an empty lines array).
  // Lines ascend by id so lines[0] — which decides primaryAccountName — is the
  // same row getReceiptVoucher() would have put first.
  const rows = db
    .select({
      voucher: receiptVouchers,
      line: receiptVoucherLines,
      accountName: accounts.name,
    })
    .from(receiptVouchers)
    .leftJoin(receiptVoucherLines, eq(receiptVoucherLines.voucherId, receiptVouchers.id))
    .leftJoin(accounts, eq(accounts.id, receiptVoucherLines.accountId))
    .where(and(...conditions))
    .orderBy(desc(receiptVouchers.id), asc(receiptVoucherLines.id))
    .all();

  const byVoucher = new Map<number, ReceiptVoucher & { lines: ReceiptVoucherLine[]; primaryAccountName: string }>();
  for (const row of rows) {
    let entry = byVoucher.get(row.voucher.id);
    if (!entry) {
      entry = { ...row.voucher, lines: [], primaryAccountName: "" };
      byVoucher.set(row.voucher.id, entry);
    }
    if (!row.line) continue;
    entry.lines.push(row.line);
    if (entry.lines.length === 1) entry.primaryAccountName = row.accountName || "";
  }

  // Map preserves insertion order, so this keeps the query's id-descending sort.
  return Array.from(byVoucher.values());
}

export async function getReceiptVoucher(id: number): Promise<(ReceiptVoucher & { lines: ReceiptVoucherLine[] }) | undefined> {
  const [voucher] = db.select().from(receiptVouchers).where(and(eq(receiptVouchers.id, id), isNull(receiptVouchers.deletedAt))).all();
  if (!voucher) return undefined;
  const lines = db.select().from(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).all();
  return { ...voucher, lines };
}

export async function getNextReceiptVoucherNumber(voucherType: "CR" | "CP" | "BR" | "BP" = "CR"): Promise<string> {
  const year = new Date().getFullYear();
  const [last] = db.select().from(receiptVouchers)
    .where(eq(receiptVouchers.voucherType, voucherType))
    .orderBy(desc(receiptVouchers.id))
    .limit(1)
    .all();
  const nextNum = last ? parseInt(last.voucherNumber.split("-").pop() || "0") + 1 : 1;
  return `${voucherType}-${year}-${String(nextNum).padStart(5, "0")}`;
}

export function validateBalanced(lines: ReceiptLineInput[]) {
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

export function resolveReceiptOrPaymentNarration(
  client: DbClient,
  voucherType: "CR" | "CP" | "BR" | "BP",
  voucherNumber: string,
  headerNarration: unknown,
  lines: ReceiptLineInput[],
): string {
  const isReceipt = voucherType === "CR" || voucherType === "BR";
  const linkedLine = lines.find((line) => isReceipt ? Boolean(line.saleId) : Boolean(line.purchaseId));
  const primaryLine = linkedLine || lines[0];
  const [party] = primaryLine
    ? client.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, primaryLine.accountId)).limit(1).all()
    : [];
  const invoiceNumber = isReceipt && linkedLine?.saleId
    ? client.select({ invoiceNumber: sales.invoiceNumber }).from(sales).where(eq(sales.id, linkedLine.saleId)).limit(1).all()[0]?.invoiceNumber
    : !isReceipt && linkedLine?.purchaseId
      ? client.select({ invoiceNumber: purchases.invoiceNumber }).from(purchases).where(eq(purchases.id, linkedLine.purchaseId)).limit(1).all()[0]?.invoiceNumber
      : undefined;
  const common = {
    headerNarration,
    lineNarrations: lines.map((line) => line.narration),
    partyName: party?.name,
    invoiceNumber,
    voucherNumber,
  };
  return isReceipt
    ? buildReceiptVoucherNarrationText(common)
    : buildPaymentVoucherNarrationText(common);
}

export async function createReceiptVoucher(data: InsertReceiptVoucher, lines: ReceiptLineInput[]): Promise<ReceiptVoucher> {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = data.voucherDate ? new Date(data.voucherDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "receipt/payment voucher");

      const voucherType = normalizeReceiptVoucherType(data.voucherType);
      const settlementAccount =
        data.settlementAccountId ||
        (voucherType === "CR" ? ensureCashAccount(client).id : ensureSystemAccount(client, "Cash in Hand", "asset").id);

      const cleanLines = (lines || []).map((line) => {
        const amt = resolveReceiptLineAmount(line).toString();
        return {
          ...line,
          debit: (voucherType === "CP" || voucherType === "BP") ? amt : "0",
          credit: (voucherType === "CR" || voucherType === "BR") ? amt : "0",
        };
      });

      const total = cleanLines.reduce((sum, l) => sum + resolveReceiptLineAmount(l), 0);
      if (total <= 0) throw new Error("Voucher amount must be greater than 0");

    const year = new Date().getFullYear();
    const [last] = tx.select().from(receiptVouchers)
      .where(eq(receiptVouchers.voucherType, normalizeReceiptVoucherType(data.voucherType || "CR")))
      .orderBy(desc(receiptVouchers.id))
      .limit(1)
      .all();
    const nextNum = last ? parseInt(last.voucherNumber.split("-").pop() || "0") + 1 : 1;
    const generatedNumber = `${data.voucherType || "CR"}-${year}-${String(nextNum).padStart(5, "0")}`;
    const voucherNumber = (data.voucherNumber && data.voucherNumber.trim() !== "")
      ? data.voucherNumber
      : generatedNumber;
    const resolvedNarration = resolveReceiptOrPaymentNarration(
      client,
      voucherType,
      voucherNumber,
      data.narration,
      cleanLines,
    );
    const narratedLines = cleanLines.map((line) => ({
      ...line,
      narration: preferManualNarration(line.narration, resolvedNarration),
    }));

    // Append counter-entry for the structurally identified settlement account.
    const settlementLine: ReceiptLineInput = voucherType === "CR"
      ? { accountId: settlementAccount, debit: total.toString(), credit: "0", narration: resolvedNarration }
      : { accountId: settlementAccount, debit: "0", credit: total.toString(), narration: resolvedNarration };

    const normalizedLines = [...narratedLines, settlementLine];
    const { totalDebit, totalCredit } = validateBalanced(normalizedLines);

    const voucher = tx.insert(receiptVouchers).values({
      ...data,
      narration: resolvedNarration,
      settlementAccountId: settlementAccount,
      voucherNumber,
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
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
        postLedgerEntry(client, {
          accountId: line.accountId,
          transactionType: "debit",
          amount: debit.toString(),
          description: resolvedNarration,
          ...getLedgerReferenceColumns("receipt_voucher", voucher.id),
          entryDate: postingDate,
        });
      }
      if (credit > 0) {
        postLedgerEntry(client, {
          accountId: line.accountId,
          transactionType: "credit",
          amount: credit.toString(),
          description: resolvedNarration,
          ...getLedgerReferenceColumns("receipt_voucher", voucher.id),
          entryDate: postingDate,
        });
      }
    }

    // CP/BP: when a line is linked to a purchase, update that purchase's paid amount
    if (voucherType === "CP" || voucherType === "BP") {
      for (const line of cleanLines) {
        const purchaseId = (line as { purchaseId?: number | null }).purchaseId;
        if (!purchaseId) continue;
        const amount = parseAmount(line.debit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(purchases).where(eq(purchases.id, purchaseId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.min(currentPaid + amount, totalAmount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(purchases).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(purchases.id, purchaseId)).run();
      }

      // Auto-sync payroll status when employee payable account is settled via CP/BP.
      for (const line of cleanLines) {
        const amount = parseAmount(line.debit || "0");
        if (amount <= 0) continue;
        const [acc] = tx.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.id, line.accountId)).limit(1).all();
        if (!acc || String(acc.type).toLowerCase() !== "employee") continue;
        payrollModel.autoMarkPayrollPaidForEmployee(tx as unknown as DbClient, {
          employeeAccountId: acc.id,
          amount,
          paymentDate: postingDate,
          method: voucherType === "BP" ? "Bank" : "Cash",
          source: `receipt_voucher:${voucher.id}`,
          actorUserId: (data as any).createdBy ?? undefined,
        });
      }
    }

    // CR/BR: when a line is linked to a sale, update that sale's paid amount
    if (voucherType === "CR" || voucherType === "BR") {
      for (const line of cleanLines) {
        const saleId = (line as { saleId?: number | null }).saleId;
        if (!saleId) continue;
        const amount = parseAmount(line.credit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(sales).where(eq(sales.id, saleId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.min(currentPaid + amount, totalAmount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(sales).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(sales.id, saleId)).run();
      }
    }

    return voucher;
  });
}

export async function updateReceiptVoucher(id: number, data: Partial<InsertReceiptVoucher>, lines: ReceiptLineInput[]): Promise<ReceiptVoucher | undefined> {
  const existing = await getReceiptVoucher(id);
  if (!existing) return undefined;
  const voucherTypeExisting = normalizeReceiptVoucherType(existing.voucherType);
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = data.voucherDate ? new Date(data.voucherDate as any) : existing.voucherDate ? new Date(existing.voucherDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "receipt/payment voucher");

    // Reverse previous purchase paid-amount allocations for CP/BP
    if (voucherTypeExisting === "CP" || voucherTypeExisting === "BP") {
      for (const line of existing.lines || []) {
        const purchaseId = line.purchaseId;
        if (!purchaseId) continue;
        const amount = parseAmount(line.debit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(purchases).where(eq(purchases.id, purchaseId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.max(0, currentPaid - amount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(purchases).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(purchases.id, purchaseId)).run();
      }
    }

    // Reverse previous sale paid-amount allocations for CR/BR
    if (voucherTypeExisting === "CR" || voucherTypeExisting === "BR") {
      for (const line of existing.lines || []) {
        const saleId = line.saleId;
        if (!saleId) continue;
        const amount = parseAmount(line.credit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(sales).where(eq(sales.id, saleId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.max(0, currentPaid - amount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(sales).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(sales.id, saleId)).run();
      }
    }

    const priorLedgerEntries = tx.select().from(ledgerEntries)
      .where(buildLedgerReferenceWhere("receipt_voucher", id) as any).all();
    const priorAccountIds = [...new Set(priorLedgerEntries.map((entry) => entry.accountId))];
    tx.delete(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).run();
    tx.delete(ledgerEntries).where(buildLedgerReferenceWhere("receipt_voucher", id) as any).run();
    recomputeAccountBalances(client, priorAccountIds);

      const voucherType = normalizeReceiptVoucherType(data.voucherType || existing.voucherType || "CR");
      const settlementAccount =
        data.settlementAccountId ||
        existing.settlementAccountId ||
        (voucherType === "CR" ? ensureCashAccount(client).id : ensureSystemAccount(client, "Cash in Hand", "asset").id);

      // Exclude settlement lines - they are auto-generated; including them would double the amount
      const paymentLinesOnly = (lines || []).filter(
        (line) => line.accountId !== settlementAccount
      );

      const cleanLines = paymentLinesOnly.map((line) => {
        const amt = resolveReceiptLineAmount(line).toString();
        return {
          ...line,
          debit: (voucherType === "CP" || voucherType === "BP") ? amt : "0",
          credit: (voucherType === "CR" || voucherType === "BR") ? amt : "0",
        };
      });

      const total = cleanLines.reduce((sum, l) => sum + resolveReceiptLineAmount(l), 0);
      if (total <= 0) throw new Error("Voucher amount must be greater than 0");

    const resolvedNarration = resolveReceiptOrPaymentNarration(
      client,
      voucherType,
      existing.voucherNumber,
      data.narration === undefined ? existing.narration : data.narration,
      cleanLines,
    );
    const narratedLines = cleanLines.map((line) => ({
      ...line,
      narration: preferManualNarration(line.narration, resolvedNarration),
    }));
    const settlementLine: ReceiptLineInput = voucherType === "CR"
      ? { accountId: settlementAccount, debit: total.toString(), credit: "0", narration: resolvedNarration }
      : { accountId: settlementAccount, debit: "0", credit: total.toString(), narration: resolvedNarration };

    const normalizedLines = [...narratedLines, settlementLine];
    const { totalDebit, totalCredit } = validateBalanced(normalizedLines);

    const updated = tx.update(receiptVouchers).set({
      ...data,
      narration: resolvedNarration,
      settlementAccountId: settlementAccount,
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
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
        postLedgerEntry(client, {
          accountId: line.accountId,
          transactionType: "debit",
          amount: debit.toString(),
          description: resolvedNarration,
          ...getLedgerReferenceColumns("receipt_voucher", id),
          entryDate: postingDate,
        });
      }
      if (credit > 0) {
        postLedgerEntry(client, {
          accountId: line.accountId,
          transactionType: "credit",
          amount: credit.toString(),
          description: resolvedNarration,
          ...getLedgerReferenceColumns("receipt_voucher", id),
          entryDate: postingDate,
        });
      }
    }

    // CP/BP: when a line is linked to a purchase, update that purchase's paid amount
    if (voucherType === "CP" || voucherType === "BP") {
      for (const line of cleanLines) {
        const purchaseId = (line as { purchaseId?: number | null }).purchaseId;
        if (!purchaseId) continue;
        const amount = parseAmount(line.debit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(purchases).where(eq(purchases.id, purchaseId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.min(currentPaid + amount, totalAmount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(purchases).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(purchases.id, purchaseId)).run();
      }
    }

    // CR/BR: when a line is linked to a sale, update that sale's paid amount
    if (voucherType === "CR" || voucherType === "BR") {
      for (const line of cleanLines) {
        const saleId = (line as { saleId?: number | null }).saleId;
        if (!saleId) continue;
        const amount = parseAmount(line.credit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(sales).where(eq(sales.id, saleId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.min(currentPaid + amount, totalAmount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(sales).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(sales.id, saleId)).run();
      }
    }

    return updated;
  });
}

export async function deleteReceiptVoucher(id: number): Promise<boolean> {
  const existing = await getReceiptVoucher(id);
  if (!existing) return false;
  const voucherType = normalizeReceiptVoucherType(existing.voucherType);
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    // Reverse purchase paid-amount allocations for CP/BP
    if (voucherType === "CP" || voucherType === "BP") {
      for (const line of existing.lines || []) {
        const purchaseId = line.purchaseId;
        if (!purchaseId) continue;
        const amount = parseAmount(line.debit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(purchases).where(eq(purchases.id, purchaseId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.max(0, currentPaid - amount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(purchases).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(purchases.id, purchaseId)).run();
      }
    }
    // Reverse sale paid-amount allocations for CR/BR
    if (voucherType === "CR" || voucherType === "BR") {
      for (const line of existing.lines || []) {
        const saleId = line.saleId;
        if (!saleId) continue;
        const amount = parseAmount(line.credit || "0");
        if (amount <= 0) continue;
        const [row] = tx.select().from(sales).where(eq(sales.id, saleId)).all();
        if (!row) continue;
        const totalAmount = parseAmount(row.totalAmount || "0");
        const currentPaid = parseAmount(row.paidAmount || "0");
        const newPaid = roundMoney(Math.max(0, currentPaid - amount));
        const balanceDue = roundMoney(Math.max(totalAmount - newPaid, 0));
        tx.update(sales).set({
          paidAmount: newPaid.toString(),
          balanceDue: balanceDue.toString(),
        }).where(eq(sales.id, saleId)).run();
      }
    }
    const priorEntries = tx
      .select()
      .from(ledgerEntries)
      .where(buildLedgerReferenceWhere("receipt_voucher", id) as any)
      .all();
    const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
    tx.delete(ledgerEntries)
      .where(buildLedgerReferenceWhere("receipt_voucher", id) as any)
      .run();
    recomputeAccountBalances(client, affectedAccountIds);
    tx.update(receiptVouchers).set({ deletedAt: new Date() }).where(eq(receiptVouchers.id, id)).run();
    tx.delete(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, id)).run();
    return true;
  });
}
