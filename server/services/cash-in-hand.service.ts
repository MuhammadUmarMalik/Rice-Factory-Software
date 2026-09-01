/**
 * Cash in Hand module - service layer
 * Handles receipts, payments, journal vouchers, balance calculation, and auto-linking with Sales/Purchases
 */
import { db, sqlite } from "../models/db";
import {
  cashAccounts,
  cashReceipts,
  cashPayments,
  cashJournalVouchers,
  cashJournalItems,
  journalVouchers,
  journalVoucherEntries,
  accounts,
  sales,
  purchases,
} from "../db/schema";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
import type { InsertCashReceipt, InsertCashPayment, CashReceipt, CashPayment } from "../db/schema";
import {
  buildCashJournalVoucherNarration,
  buildCashPaymentNarration,
  buildCashReceiptNarration,
  cleanNarrationSegment,
  displayNarration,
  joinNarration,
  preferManualNarration,
  summarizeNarrationValues,
} from "../utils/narration";

const parseNum = (v: string | number | null | undefined): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

const toDateValue = (value: string | number | Date | null | undefined, fieldName: string): Date => {
  let dt: Date;
  if (value instanceof Date) {
    dt = value;
  } else if (typeof value === "number") {
    const normalized = Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    dt = new Date(normalized);
  } else if (typeof value === "string") {
    dt = new Date(value);
  } else {
    dt = new Date();
  }
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return dt;
};

const VOUCHER_TABLES = {
  "CR": "cash_receipts",
  "CP": "cash_payments",
  "JV": "cash_journal_vouchers",
} as const;

function getNextVoucherNo(prefix: "CR" | "CP" | "JV"): string {
  const year = new Date().getFullYear();
  const name = `${prefix}:${year}`;
  // Single-statement atomic allocation: the initial value is seeded from the
  // maximum existing id, and subsequent calls increment under SQLite's
  // per-statement serialization so concurrent requests cannot collide.
  const row = sqlite
    .prepare(
      `INSERT INTO sequences (name, value)
       VALUES (?, (SELECT COALESCE(MAX(id), 0) + 1 FROM ${VOUCHER_TABLES[prefix]}))
       ON CONFLICT(name) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .get(name) as { value: number };
  return `${prefix}-${year}-${String(row.value).padStart(4, "0")}`;
}

async function ensureCashAccount(cashAccountId = 1) {
  const [acc] = db.select().from(cashAccounts).where(eq(cashAccounts.id, cashAccountId)).all();
  if (!acc) {
    const [inserted] = db.insert(cashAccounts).values({
      id: cashAccountId,
      accountName: "Main Cash",
      openingBalance: "0",
    }).returning().all();
    return inserted!;
  }
  return acc;
}

export async function getBalance(cashAccountId = 1, asOfDate?: string): Promise<{
  openingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  currentBalance: number;
}> {
  await ensureCashAccount(cashAccountId);
  const [acc] = db.select().from(cashAccounts).where(eq(cashAccounts.id, cashAccountId)).all();
  const opening = parseNum(acc?.openingBalance ?? "0");


  const receiptRows = db.select({ amount: cashReceipts.amount })
    .from(cashReceipts)
    .where(asOfDate
      ? and(
          eq(cashReceipts.cashAccountId, cashAccountId),
          lte(cashReceipts.receiptDate, new Date(asOfDate + "T23:59:59"))
        )
      : eq(cashReceipts.cashAccountId, cashAccountId))
    .all();

  const paymentRows = db.select({ amount: cashPayments.amount })
    .from(cashPayments)
    .where(asOfDate
      ? and(
          eq(cashPayments.cashAccountId, cashAccountId),
          lte(cashPayments.paymentDate, new Date(asOfDate + "T23:59:59"))
        )
      : eq(cashPayments.cashAccountId, cashAccountId))
    .all();

  let totalReceipts = 0;
  let totalPayments = 0;
  for (const r of receiptRows) totalReceipts += parseNum(r.amount);
  for (const p of paymentRows) totalPayments += parseNum(p.amount);

  const currentBalance = opening + totalReceipts - totalPayments;
  return { openingBalance: opening, totalReceipts, totalPayments, currentBalance };
}

export async function getReceipts(filters?: {
  from?: string;
  to?: string;
  cashAccountId?: number;
}): Promise<(CashReceipt & { saleRef?: string; invoiceRef?: string })[]> {
  const conditions = [];
  if (filters?.cashAccountId) conditions.push(eq(cashReceipts.cashAccountId, filters.cashAccountId));
  if (filters?.from) conditions.push(gte(cashReceipts.receiptDate, new Date(filters.from)));
  if (filters?.to) conditions.push(lte(cashReceipts.receiptDate, new Date(filters.to + "T23:59:59")));
  const q = conditions.length > 0
    ? db.select().from(cashReceipts).where(and(...conditions)).orderBy(desc(cashReceipts.receiptDate))
    : db.select().from(cashReceipts).orderBy(desc(cashReceipts.receiptDate));
  const rows = q.all();
  const result = rows as (CashReceipt & { saleRef?: string; invoiceRef?: string })[];
  for (const r of result) {
    if (r.referenceType === "sale" && r.referenceId) {
      const [s] = db.select({ invoiceNumber: sales.invoiceNumber }).from(sales).where(eq(sales.id, r.referenceId)).all();
      if (s) r.invoiceRef = s.invoiceNumber;
    }
  }
  return result;
}

export async function getReceiptById(id: number): Promise<CashReceipt | null> {
  const [r] = db.select().from(cashReceipts).where(eq(cashReceipts.id, id)).all();
  return r ?? null;
}

export async function createReceipt(data: Omit<InsertCashReceipt, "voucherNo" | "createdAt"> & { voucherNo?: string }): Promise<CashReceipt> {
  const voucherNo = data.voucherNo ?? getNextVoucherNo("CR");
  const amount = parseNum(data.amount);
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  if (!data.receivedFrom || !String(data.receivedFrom).trim()) throw new Error("Received from is required");
  await ensureCashAccount(data.cashAccountId ?? 1);
  const linkedSale = data.referenceType === "sale" && data.referenceId
    ? db
        .select({ invoiceNumber: sales.invoiceNumber, customerName: accounts.name })
        .from(sales)
        .leftJoin(accounts, eq(sales.customerId, accounts.id))
        .where(eq(sales.id, data.referenceId))
        .limit(1)
        .all()[0]
    : undefined;
  const description = buildCashReceiptNarration({
    description: data.description,
    partyName: linkedSale?.customerName || data.receivedFrom,
    invoiceNumber: linkedSale?.invoiceNumber,
    reference: data.referenceId || voucherNo,
  });
  const [inserted] = db.insert(cashReceipts).values({
    voucherNo,
    receiptDate: toDateValue(data.receiptDate as any, "receipt date"),
    receivedFrom: data.receivedFrom,
    amount: String(amount),
    description,
    paymentMode: data.paymentMode ?? "cash",
    referenceType: data.referenceType ?? null,
    referenceId: data.referenceId ?? null,
    cashAccountId: data.cashAccountId ?? 1,
  }).returning().all();
  return inserted!;
}

export async function updateReceipt(id: number, data: Partial<Omit<InsertCashReceipt, "voucherNo" | "createdAt">>): Promise<CashReceipt | null> {
  const [existing] = db.select().from(cashReceipts).where(eq(cashReceipts.id, id)).all();
  if (!existing) return null;
  if (existing.referenceType === "sale" && existing.referenceId) {
    throw new Error(`This receipt is linked to Sale #${existing.referenceId}. Delete the sale instead.`);
  }
  const amount = data.amount != null ? parseNum(data.amount) : parseNum(existing.amount);
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  const description = data.description === undefined
    ? existing.description
    : buildCashReceiptNarration({
        description: data.description,
        partyName: data.receivedFrom ?? existing.receivedFrom,
        reference: existing.referenceId || existing.voucherNo,
      });
  const [updated] = db.update(cashReceipts).set({
    ...(data.receiptDate != null && { receiptDate: toDateValue(data.receiptDate as any, "receipt date") }),
    ...(data.receivedFrom != null && { receivedFrom: data.receivedFrom }),
    ...(data.amount != null && { amount: String(amount) }),
    ...(data.description !== undefined && { description }),
  }).where(eq(cashReceipts.id, id)).returning().all();
  return updated ?? null;
}

export async function deleteReceipt(id: number): Promise<{ ok: boolean; error?: string }> {
  const [r] = db.select().from(cashReceipts).where(eq(cashReceipts.id, id)).all();
  if (!r) return { ok: false, error: "Receipt not found" };
  if (r.referenceType === "sale" && r.referenceId) {
    return { ok: false, error: `This entry is linked to Sale #${r.referenceId}, delete the sale instead.` };
  }
  db.delete(cashReceipts).where(eq(cashReceipts.id, id)).run();
  return { ok: true };
}

export async function getPayments(filters?: {
  from?: string;
  to?: string;
  cashAccountId?: number;
}): Promise<(CashPayment & { purchaseRef?: string; invoiceRef?: string })[]> {
  const conditions = [];
  if (filters?.cashAccountId) conditions.push(eq(cashPayments.cashAccountId, filters.cashAccountId));
  if (filters?.from) conditions.push(gte(cashPayments.paymentDate, new Date(filters.from)));
  if (filters?.to) conditions.push(lte(cashPayments.paymentDate, new Date(filters.to + "T23:59:59")));
  const q = conditions.length > 0
    ? db.select().from(cashPayments).where(and(...conditions)).orderBy(desc(cashPayments.paymentDate))
    : db.select().from(cashPayments).orderBy(desc(cashPayments.paymentDate));
  const rows = q.all();
  const result = rows as (CashPayment & { purchaseRef?: string; invoiceRef?: string })[];
  for (const r of result) {
    if (r.referenceType === "purchase" && r.referenceId) {
      const [p] = db.select({ invoiceNumber: purchases.invoiceNumber }).from(purchases).where(eq(purchases.id, r.referenceId)).all();
      if (p) r.invoiceRef = p.invoiceNumber;
    }
  }
  return result;
}

export async function getPaymentById(id: number): Promise<CashPayment | null> {
  const [p] = db.select().from(cashPayments).where(eq(cashPayments.id, id)).all();
  return p ?? null;
}

export async function createPayment(data: Omit<InsertCashPayment, "voucherNo" | "createdAt"> & { voucherNo?: string }): Promise<CashPayment> {
  const voucherNo = data.voucherNo ?? getNextVoucherNo("CP");
  const amount = parseNum(data.amount);
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  if (!data.paidTo || !String(data.paidTo).trim()) throw new Error("Paid to is required");
  await ensureCashAccount(data.cashAccountId ?? 1);
  const linkedPurchase = data.referenceType === "purchase" && data.referenceId
    ? db
        .select({ invoiceNumber: purchases.invoiceNumber, supplierName: accounts.name })
        .from(purchases)
        .leftJoin(accounts, eq(purchases.supplierId, accounts.id))
        .where(eq(purchases.id, data.referenceId))
        .limit(1)
        .all()[0]
    : undefined;
  const description = buildCashPaymentNarration({
    description: data.description,
    partyName: linkedPurchase?.supplierName || data.paidTo,
    invoiceNumber: linkedPurchase?.invoiceNumber,
    reference: data.referenceId || voucherNo,
  });
  const [inserted] = db.insert(cashPayments).values({
    voucherNo,
    paymentDate: toDateValue(data.paymentDate as any, "payment date"),
    paidTo: data.paidTo,
    amount: String(amount),
    description,
    paymentMode: data.paymentMode ?? "cash",
    referenceType: data.referenceType ?? null,
    referenceId: data.referenceId ?? null,
    cashAccountId: data.cashAccountId ?? 1,
  }).returning().all();
  return inserted!;
}

export async function updatePayment(id: number, data: Partial<Omit<InsertCashPayment, "voucherNo" | "createdAt">>): Promise<CashPayment | null> {
  const [existing] = db.select().from(cashPayments).where(eq(cashPayments.id, id)).all();
  if (!existing) return null;
  if (existing.referenceType === "purchase" && existing.referenceId) {
    throw new Error(`This payment is linked to Purchase #${existing.referenceId}. Delete the purchase instead.`);
  }
  const amount = data.amount != null ? parseNum(data.amount) : parseNum(existing.amount);
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  const description = data.description === undefined
    ? existing.description
    : buildCashPaymentNarration({
        description: data.description,
        partyName: data.paidTo ?? existing.paidTo,
        reference: existing.referenceId || existing.voucherNo,
      });
  const [updated] = db.update(cashPayments).set({
    ...(data.paymentDate != null && { paymentDate: toDateValue(data.paymentDate as any, "payment date") }),
    ...(data.paidTo != null && { paidTo: data.paidTo }),
    ...(data.amount != null && { amount: String(amount) }),
    ...(data.description !== undefined && { description }),
  }).where(eq(cashPayments.id, id)).returning().all();
  return updated ?? null;
}

export async function deletePayment(id: number): Promise<{ ok: boolean; error?: string }> {
  const [p] = db.select().from(cashPayments).where(eq(cashPayments.id, id)).all();
  if (!p) return { ok: false, error: "Payment not found" };
  if (p.referenceType === "purchase" && p.referenceId) {
    return { ok: false, error: `This entry is linked to Purchase #${p.referenceId}, delete the purchase instead.` };
  }
  db.delete(cashPayments).where(eq(cashPayments.id, id)).run();
  return { ok: true };
}

export type LedgerRow = {
  date: number;
  voucherNo: string;
  type: "receipt" | "payment" | "opening";
  description: string;
  reference: string;
  referenceType?: string | null;
  referenceId?: number | null;
  debit: number;
  credit: number;
  balance: number;
};

export async function getLedger(filters?: { from?: string; to?: string; cashAccountId?: number }): Promise<LedgerRow[]> {
  const cashAccountId = filters?.cashAccountId ?? 1;
  await ensureCashAccount(cashAccountId);
  const openingAsOf = filters?.from
    ? new Date(new Date(filters.from + "T00:00:00").getTime() - 1).toISOString().slice(0, 10)
    : undefined;
  const balance = await getBalance(cashAccountId, openingAsOf);
  const rows: LedgerRow[] = [];
  let runningBalance = balance.openingBalance;

  const receipts = await getReceipts(filters);
  const payments = await getPayments(filters);

  const entries: { date: number; type: "receipt" | "payment"; voucherNo: string; desc: string; ref: string; refType?: string; refId?: number; debit: number; credit: number }[] = [];
  for (const r of receipts) {
    entries.push({
      date: typeof r.receiptDate === "number" ? r.receiptDate : new Date(r.receiptDate).getTime(),
      type: "receipt",
      voucherNo: r.voucherNo,
      desc: displayNarration(r.description),
      ref: r.referenceType === "sale" && r.referenceId ? `Sale #${r.referenceId}` : (r.referenceType || ""),
      refType: r.referenceType ?? undefined,
      refId: r.referenceId ?? undefined,
      debit: parseNum(r.amount),
      credit: 0,
    });
  }
  for (const p of payments) {
    entries.push({
      date: typeof p.paymentDate === "number" ? p.paymentDate : new Date(p.paymentDate).getTime(),
      type: "payment",
      voucherNo: p.voucherNo,
      desc: displayNarration(p.description),
      ref: p.referenceType === "purchase" && p.referenceId ? `Purchase #${p.referenceId}` : (p.referenceType || ""),
      refType: p.referenceType ?? undefined,
      refId: p.referenceId ?? undefined,
      debit: 0,
      credit: parseNum(p.amount),
    });
  }
  entries.sort((a, b) => a.date - b.date);

  rows.push({
    date: 0,
    voucherNo: "",
    type: "opening",
    description: "Opening Balance",
    reference: "",
    debit: 0,
    credit: 0,
    balance: runningBalance,
  });

  for (const e of entries) {
    runningBalance += e.debit - e.credit;
    rows.push({
      date: e.date,
      voucherNo: e.voucherNo,
      type: e.type,
      description: e.desc,
      reference: e.ref,
      referenceType: e.refType ?? null,
      referenceId: e.refId ?? null,
      debit: e.debit,
      credit: e.credit,
      balance: runningBalance,
    });
  }
  return rows;
}

export async function getTodaySummary(cashAccountId = 1): Promise<{
  openingBalance: number;
  todayReceipts: number;
  todayPayments: number;
  closingBalance: number;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const balance = await getBalance(cashAccountId, yesterdayStr);
  const receiptRows = db.select({ amount: cashReceipts.amount }).from(cashReceipts)
    .where(and(
      eq(cashReceipts.cashAccountId, cashAccountId),
      gte(cashReceipts.receiptDate, new Date(today)),
      lte(cashReceipts.receiptDate, new Date(today + "T23:59:59"))
    )).all();
  const paymentRows = db.select({ amount: cashPayments.amount }).from(cashPayments)
    .where(and(
      eq(cashPayments.cashAccountId, cashAccountId),
      gte(cashPayments.paymentDate, new Date(today)),
      lte(cashPayments.paymentDate, new Date(today + "T23:59:59"))
    )).all();
  let todayReceipts = 0;
  let todayPayments = 0;
  for (const r of receiptRows) todayReceipts += parseNum(r.amount);
  for (const p of paymentRows) todayPayments += parseNum(p.amount);
  const closingBalance = balance.openingBalance + balance.totalReceipts - balance.totalPayments + todayReceipts - todayPayments;
  return {
    openingBalance: balance.openingBalance,
    todayReceipts,
    todayPayments,
    closingBalance,
  };
}

// Journal Vouchers (Cash module)
export type CashJournalItemInput = { accountHead: string; debitAmount: string; creditAmount: string; narration?: string };

export async function getJournalVouchers(): Promise<typeof cashJournalVouchers.$inferSelect[]> {
  return db.select().from(cashJournalVouchers).orderBy(desc(cashJournalVouchers.voucherDate)).all();
}

export async function getJournalVoucherById(id: number): Promise<{
  voucher: typeof cashJournalVouchers.$inferSelect;
  items: typeof cashJournalItems.$inferSelect[];
} | null> {
  const [v] = db.select().from(cashJournalVouchers).where(eq(cashJournalVouchers.id, id)).all();
  if (!v) return null;
  const items = db.select().from(cashJournalItems).where(eq(cashJournalItems.journalId, id)).all();
  return { voucher: v, items };
}

export async function createJournalVoucher(data: {
  voucherDate: string | number;
  narration?: string;
  items: CashJournalItemInput[];
}): Promise<{ id: number; voucherNo: string }> {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const it of data.items) {
    totalDebit += parseNum(it.debitAmount);
    totalCredit += parseNum(it.creditAmount);
  }
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error("Total debit must equal total credit");
  }
  const voucherNo = getNextVoucherNo("JV");
  const debitSummary = summarizeNarrationValues(
    data.items.filter((item) => parseNum(item.debitAmount) > 0).map((item) => item.accountHead),
  );
  const creditSummary = summarizeNarrationValues(
    data.items.filter((item) => parseNum(item.creditAmount) > 0).map((item) => item.accountHead),
  );
  const transactionSummary = joinNarration([debitSummary, creditSummary], " to ");
  const resolvedNarration = buildCashJournalVoucherNarration({
    headerNarration: data.narration,
    itemNarrations: data.items.map((item) => item.narration),
    voucherNumber: voucherNo,
    summary: transactionSummary,
  });
  const [v] = db.insert(cashJournalVouchers).values({
    voucherNo,
    voucherDate: toDateValue(data.voucherDate as any, "voucher date"),
    narration: resolvedNarration,
    totalDebit: String(totalDebit),
    totalCredit: String(totalCredit),
  }).returning().all();
  if (!v) throw new Error("Failed to create journal voucher");
  for (const it of data.items) {
    db.insert(cashJournalItems).values({
      journalId: v.id,
      accountHead: it.accountHead,
      debitAmount: it.debitAmount || "0",
      creditAmount: it.creditAmount || "0",
      narration: preferManualNarration(it.narration, resolvedNarration),
    }).run();
  }
  // Auto-create cash receipt/payment if Cash is in account heads
  const cashAccountId = 1;
  for (const it of data.items) {
    const head = (it.accountHead || "").toLowerCase();
    if (head === "cash" || head === "main cash") {
      const debit = parseNum(it.debitAmount);
      const credit = parseNum(it.creditAmount);
      if (debit > 0) {
        await createReceipt({
          receiptDate: toDateValue(data.voucherDate as any, "receipt date"),
          receivedFrom: resolvedNarration,
          amount: String(debit),
          description: resolvedNarration,
          referenceType: "journal",
          referenceId: v.id,
          cashAccountId,
        });
      }
      if (credit > 0) {
        await createPayment({
          paymentDate: toDateValue(data.voucherDate as any, "payment date"),
          paidTo: resolvedNarration,
          amount: String(credit),
          description: resolvedNarration,
          referenceType: "journal",
          referenceId: v.id,
          cashAccountId,
        });
      }
      break;
    }
  }
  return { id: v.id, voucherNo };
}

/**
 * Interlink: When existing journal voucher (journalVouchers) affects Cash account,
 * create cash_receipt or cash_payment so Cash module balance stays in sync.
 * Call this after JV is approved/posted.
 */
export async function syncCashFromJournalVoucher(jvId: number): Promise<void> {
  const [voucher] = db.select().from(journalVouchers).where(eq(journalVouchers.id, jvId)).all();
  if (!voucher) return;
  const entries = db.select().from(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, jvId)).all();
  const [cashAccount] = db.select().from(accounts)
    .where(and(eq(accounts.name, "Cash in Hand"), eq(accounts.isSystemAccount, true))).all();
  if (!cashAccount) return;
  const receiptDate = toDateValue(voucher.voucherDate as any, "receipt date");
  const narration = cleanNarrationSegment(voucher.narration) || `Journal Voucher #${voucher.voucherNo}`;
  for (const e of entries) {
    if (e.accountId !== cashAccount.id) continue;
    const amt = parseNum(e.amount);
    if (amt <= 0) continue;
    if (e.entryType === "DEBIT") {
      await createReceipt({
        receiptDate,
        receivedFrom: narration,
        amount: String(amt),
        description: narration,
        referenceType: "journal",
        referenceId: jvId,
        cashAccountId: 1,
      });
    } else if (e.entryType === "CREDIT") {
      await createPayment({
        paymentDate: receiptDate,
        paidTo: narration,
        amount: String(amt),
        description: narration,
        referenceType: "journal",
        referenceId: jvId,
        cashAccountId: 1,
      });
    }
  }
}

export async function updateCashAccountOpeningBalance(cashAccountId: number, openingBalance: number): Promise<void> {
  await ensureCashAccount(cashAccountId);
  db.update(cashAccounts).set({ openingBalance: String(openingBalance) }).where(eq(cashAccounts.id, cashAccountId)).run();
}

/** Update sale paid amount and balance due (so Sales list shows correct paid) */
function syncSalePaidAmount(saleId: number, paidAmount: number) {
  const [row] = db.select({ totalAmount: sales.totalAmount }).from(sales).where(eq(sales.id, saleId)).all();
  if (!row) return;
  const total = parseNum(row.totalAmount);
  const paid = Math.min(Math.max(0, paidAmount), total);
  const balanceDue = Math.max(total - paid, 0);
  db.update(sales).set({
    paidAmount: String(paid),
    balanceDue: String(balanceDue),
  }).where(eq(sales.id, saleId)).run();
}

/** Auto-link: create cash receipt for a sale and link back */
export async function createReceiptForSale(params: {
  saleId: number;
  paidAmount: number;
  receivedFrom: string;
  receiptDate: string | number;
  invoiceNumber: string;
}): Promise<number> {
  if (params.paidAmount <= 0) return 0;
  const receipt = await createReceipt({
    receiptDate: toDateValue(params.receiptDate as any, "receipt date"),
    receivedFrom: params.receivedFrom,
    amount: String(params.paidAmount),
    referenceType: "sale",
    referenceId: params.saleId,
    cashAccountId: 1,
  });
  sqlite.prepare("UPDATE sales SET cash_receipt_id = ? WHERE id = ?").run(receipt.id, params.saleId);
  syncSalePaidAmount(params.saleId, params.paidAmount);
  return receipt.id;
}

/** Auto-link: update or create cash receipt when sale is updated (payment mode cash) */
export async function updateOrCreateReceiptForSale(params: {
  saleId: number;
  paidAmount: number;
  receivedFrom: string;
  receiptDate: string | number;
  invoiceNumber: string;
  existingCashReceiptId?: number | null;
}): Promise<number | null> {
  if (params.paidAmount <= 0) return null;
  const receiptDate = toDateValue(params.receiptDate as any, "receipt date");
  const amountStr = String(params.paidAmount);

  if (params.existingCashReceiptId) {
    const [existing] = db.select().from(cashReceipts).where(eq(cashReceipts.id, params.existingCashReceiptId)).all();
    const description = buildCashReceiptNarration({
      description: existing?.description,
      partyName: params.receivedFrom,
      invoiceNumber: params.invoiceNumber,
      reference: params.saleId,
    });
    db.update(cashReceipts).set({
      receiptDate,
      receivedFrom: params.receivedFrom,
      amount: amountStr,
      description,
    }).where(eq(cashReceipts.id, params.existingCashReceiptId)).run();
    syncSalePaidAmount(params.saleId, params.paidAmount);
    return params.existingCashReceiptId;
  }
  const receipt = await createReceipt({
    receiptDate,
    receivedFrom: params.receivedFrom,
    amount: amountStr,
    referenceType: "sale",
    referenceId: params.saleId,
    cashAccountId: 1,
  });
  sqlite.prepare("UPDATE sales SET cash_receipt_id = ? WHERE id = ?").run(receipt.id, params.saleId);
  syncSalePaidAmount(params.saleId, params.paidAmount);
  return receipt.id;
}

/** Auto-link: remove existing cash receipt linkage from a sale (used when payment mode/amount changes) */
export async function unlinkReceiptForSale(params: {
  saleId: number;
  existingCashReceiptId?: number | null;
}): Promise<void> {
  const receiptId = params.existingCashReceiptId ?? null;
  if (receiptId) {
    db.delete(cashReceipts)
      .where(and(
        eq(cashReceipts.id, receiptId),
        eq(cashReceipts.referenceType, "sale"),
        eq(cashReceipts.referenceId, params.saleId),
      ))
      .run();
  } else {
    db.delete(cashReceipts)
      .where(and(
        eq(cashReceipts.referenceType, "sale"),
        eq(cashReceipts.referenceId, params.saleId),
      ))
      .run();
  }

  db.update(sales)
    .set({ cashReceiptId: null })
    .where(eq(sales.id, params.saleId))
    .run();
}

/** Get cash receipt voucher no by id (for sale display) */
export async function getCashReceiptVoucherNo(cashReceiptId: number): Promise<string | null> {
  const [r] = db.select({ voucherNo: cashReceipts.voucherNo }).from(cashReceipts).where(eq(cashReceipts.id, cashReceiptId)).all();
  return r?.voucherNo ?? null;
}

/** Get multiple cash receipt voucher numbers (for list enrichment) */
export function getCashReceiptVoucherNos(cashReceiptIds: number[]): Map<number, string> {
  const uniq = [...new Set(cashReceiptIds)].filter(Boolean);
  if (uniq.length === 0) return new Map();
  const rows = db.select({ id: cashReceipts.id, voucherNo: cashReceipts.voucherNo })
    .from(cashReceipts)
    .where(inArray(cashReceipts.id, uniq))
    .all();
  return new Map(rows.map((r) => [r.id, r.voucherNo]));
}

/** Auto-link: create cash payment for a purchase and link back */
export async function createPaymentForPurchase(params: {
  purchaseId: number;
  paidAmount: number;
  paidTo: string;
  paymentDate: string | number;
  invoiceNumber: string;
}): Promise<number> {
  if (params.paidAmount <= 0) return 0;
  const payment = await createPayment({
    paymentDate: toDateValue(params.paymentDate as any, "payment date"),
    paidTo: params.paidTo,
    amount: String(params.paidAmount),
    referenceType: "purchase",
    referenceId: params.purchaseId,
    cashAccountId: 1,
  });
  sqlite.prepare("UPDATE purchases SET cash_payment_id = ? WHERE id = ?").run(payment.id, params.purchaseId);
  return payment.id;
}

/** Auto-link: update or create cash payment when purchase is updated (payment mode cash) */
export async function updateOrCreatePaymentForPurchase(params: {
  purchaseId: number;
  paidAmount: number;
  paidTo: string;
  paymentDate: string | number;
  invoiceNumber: string;
  existingCashPaymentId?: number | null;
}): Promise<number | null> {
  if (params.paidAmount <= 0) return null;
  const paymentDate = toDateValue(params.paymentDate as any, "payment date");
  const amountStr = String(params.paidAmount);

  if (params.existingCashPaymentId) {
    const [existing] = db.select().from(cashPayments).where(eq(cashPayments.id, params.existingCashPaymentId)).all();
    const description = buildCashPaymentNarration({
      description: existing?.description,
      partyName: params.paidTo,
      invoiceNumber: params.invoiceNumber,
      reference: params.purchaseId,
    });
    db.update(cashPayments).set({
      paymentDate,
      paidTo: params.paidTo,
      amount: amountStr,
      description,
    }).where(eq(cashPayments.id, params.existingCashPaymentId)).run();
    return params.existingCashPaymentId;
  }
  const payment = await createPayment({
    paymentDate,
    paidTo: params.paidTo,
    amount: amountStr,
    referenceType: "purchase",
    referenceId: params.purchaseId,
    cashAccountId: 1,
  });
  sqlite.prepare("UPDATE purchases SET cash_payment_id = ? WHERE id = ?").run(payment.id, params.purchaseId);
  return payment.id;
}

/** Get cash payment voucher no by id (for purchase display) */
export async function getCashPaymentVoucherNo(cashPaymentId: number): Promise<string | null> {
  const [p] = db.select({ voucherNo: cashPayments.voucherNo }).from(cashPayments).where(eq(cashPayments.id, cashPaymentId)).all();
  return p?.voucherNo ?? null;
}

/** Get multiple cash payment voucher numbers (for list enrichment) */
export function getCashPaymentVoucherNos(cashPaymentIds: number[]): Map<number, string> {
  const uniq = [...new Set(cashPaymentIds)].filter(Boolean);
  if (uniq.length === 0) return new Map();
  const rows = db.select({ id: cashPayments.id, voucherNo: cashPayments.voucherNo })
    .from(cashPayments)
    .where(inArray(cashPayments.id, uniq))
    .all();
  return new Map(rows.map((r) => [r.id, r.voucherNo]));
}
