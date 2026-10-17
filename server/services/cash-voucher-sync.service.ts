/**
 * Keeps the Cash in Hand register and the Cash Receipt / Cash Payment vouchers
 * showing the same records.
 *
 * A CR/CP voucher posts its own double-entry lines, so the cash module must
 * never post them a second time. Instead every voucher keeps exactly one row in
 * `cash_receipts` / `cash_payments` — a mirror carrying the voucher number,
 * party, amount and date. That mirror is what the Cash in Hand list, balance,
 * ledger and cash book read, so a receipt raised on either screen appears on
 * both, and a raise, edit or delete on either screen is reflected on the
 * other.
 *
 * Movements that come from an invoice or a journal voucher keep the mirrors
 * they already had (`reference_type` = sale / purchase / journal). Those are
 * posted by the invoice or journal itself, so they deliberately stay out of the
 * Cash Receipts / Cash Payments screens, which list vouchers.
 */
import { db } from "../models/db";
import { and, eq, isNull } from "drizzle-orm";
import {
  accounts,
  cashPayments,
  cashReceipts,
  receiptVoucherLines,
  receiptVouchers,
  type ReceiptVoucher,
  type ReceiptVoucherLine,
} from "../db/schema";
import { parseAmount } from "../utils/parse";

/** Marks a cash_receipts / cash_payments row as the mirror of a CR/CP voucher. */
export const VOUCHER_MIRROR_REFERENCE = "receipt_voucher";

/**
 * The drawer every receipt and payment defaults to, matching PRIMARY_CASH_ACCOUNT_ID
 * in cash-in-hand.service. Mirrors always belong to the main drawer: a voucher
 * settled against a bank account is not cash in hand.
 */
const MIRROR_CASH_ACCOUNT_ID = 1;

type Mirror = {
  voucherNo: string;
  date: Date;
  partyName: string;
  amount: string;
  description: string;
};

type AccountIndex = { names: Map<number, string>; types: Map<number, string> };

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const numeric = typeof value === "number" ? value : Number(value);
  const ms = Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildAccountIndex(rows: { id: number; name: string; type: string }[]): AccountIndex {
  return {
    names: new Map(rows.map((a) => [a.id, a.name])),
    types: new Map(rows.map((a) => [a.id, String(a.type || "").toLowerCase()])),
  };
}

/**
 * The voucher-to-register mapping, or null when there is nothing to mirror: a
 * deleted voucher, a bank voucher (BR/BP, or a CR/CP settled straight into a
 * bank account), or one worth nothing.
 */
function buildMirror(
  voucher: ReceiptVoucher,
  lines: ReceiptVoucherLine[],
  index: AccountIndex,
): Mirror | null {
  if (voucher.deletedAt) return null;
  if (voucher.voucherType !== "CR" && voucher.voucherType !== "CP") return null;
  const settlement = voucher.settlementAccountId;
  if (settlement == null) return null;
  // Cash in hand is the drawer; a bank settlement never belongs in its register.
  if (index.types.get(settlement) === "bank") return null;

  const amount = parseAmount(voucher.voucherType === "CR" ? voucher.totalCredit : voucher.totalDebit);
  if (!(amount > 0)) return null;

  // The party is whichever line is not the cash/bank settlement line.
  const contra = lines.find((line) => line.accountId !== settlement);
  const partyName = (contra ? index.names.get(contra.accountId) : "") || "";
  return {
    voucherNo: voucher.voucherNumber,
    date: toDate(voucher.voucherDate),
    partyName: partyName || (voucher.voucherType === "CR" ? "Cash Receipt" : "Cash Payment"),
    amount: amount.toFixed(2),
    description: voucher.narration || "",
  };
}

/**
 * `voucherNo` is unique per register. Voucher numbers are five-digit padded and
 * the register's own sequence is four-digit, so this only trips on data that
 * predates the sync; disambiguate instead of failing the whole write.
 */
function usableVoucherNo(candidate: string, takenByOtherRow: boolean): string {
  return takenByOtherRow ? `${candidate} (cash)` : candidate;
}

function writeReceiptMirror(mirror: Mirror, voucherId: number) {
  const existing = db
    .select()
    .from(cashReceipts)
    .where(
      and(
        eq(cashReceipts.referenceType, VOUCHER_MIRROR_REFERENCE),
        eq(cashReceipts.referenceId, voucherId),
      ),
    )
    .all()[0];

  const clash = db
    .select({ id: cashReceipts.id })
    .from(cashReceipts)
    .where(eq(cashReceipts.voucherNo, mirror.voucherNo))
    .all()
    .some((row) => row.id !== existing?.id);

  const values = {
    voucherNo: usableVoucherNo(mirror.voucherNo, clash),
    receiptDate: mirror.date,
    receivedFrom: mirror.partyName,
    amount: mirror.amount,
    description: mirror.description,
    paymentMode: "cash",
    referenceType: VOUCHER_MIRROR_REFERENCE,
    referenceId: voucherId,
    cashAccountId: MIRROR_CASH_ACCOUNT_ID,
  };

  if (existing) {
    db.update(cashReceipts).set(values).where(eq(cashReceipts.id, existing.id)).run();
    return { ...existing, ...values };
  }
  return db.insert(cashReceipts).values(values).returning().get();
}

function writePaymentMirror(mirror: Mirror, voucherId: number) {
  const existing = db
    .select()
    .from(cashPayments)
    .where(
      and(
        eq(cashPayments.referenceType, VOUCHER_MIRROR_REFERENCE),
        eq(cashPayments.referenceId, voucherId),
      ),
    )
    .all()[0];

  const clash = db
    .select({ id: cashPayments.id })
    .from(cashPayments)
    .where(eq(cashPayments.voucherNo, mirror.voucherNo))
    .all()
    .some((row) => row.id !== existing?.id);

  const values = {
    voucherNo: usableVoucherNo(mirror.voucherNo, clash),
    paymentDate: mirror.date,
    paidTo: mirror.partyName,
    amount: mirror.amount,
    description: mirror.description,
    paymentMode: "cash",
    referenceType: VOUCHER_MIRROR_REFERENCE,
    referenceId: voucherId,
    cashAccountId: MIRROR_CASH_ACCOUNT_ID,
  };

  if (existing) {
    db.update(cashPayments).set(values).where(eq(cashPayments.id, existing.id)).run();
    return { ...existing, ...values };
  }
  return db.insert(cashPayments).values(values).returning().get();
}

function removeReceiptMirror(voucherId: number) {
  db.delete(cashReceipts)
    .where(
      and(
        eq(cashReceipts.referenceType, VOUCHER_MIRROR_REFERENCE),
        eq(cashReceipts.referenceId, voucherId),
      ),
    )
    .run();
}

function removePaymentMirror(voucherId: number) {
  db.delete(cashPayments)
    .where(
      and(
        eq(cashPayments.referenceType, VOUCHER_MIRROR_REFERENCE),
        eq(cashPayments.referenceId, voucherId),
      ),
    )
    .run();
}

/**
 * Brings one voucher's mirror up to date. Idempotent, so it is safe to call
 * after every create, edit and delete — and it removes the mirror when the
 * voucher stops qualifying (deleted, or settled into a bank account).
 *
 * Deliberately not wrapped in a transaction of its own: the caller has already
 * committed the voucher write, and a failed mirror is repaired by
 * backfillCashMirrorsFromVouchers rather than by rolling the voucher back.
 */
export function syncCashMirrorForVoucher(voucherId: number) {
  const voucher = db.select().from(receiptVouchers).where(eq(receiptVouchers.id, voucherId)).all()[0];
  if (!voucher) return null;

  const lines = db.select().from(receiptVoucherLines).where(eq(receiptVoucherLines.voucherId, voucherId)).all();
  const accountRows = db.select({ id: accounts.id, name: accounts.name, type: accounts.type }).from(accounts).all();
  const mirror = buildMirror(voucher, lines, buildAccountIndex(accountRows));

  if (voucher.voucherType === "CR") {
    if (!mirror) {
      removeReceiptMirror(voucherId);
      return null;
    }
    return writeReceiptMirror(mirror, voucherId);
  }
  if (voucher.voucherType === "CP") {
    if (!mirror) {
      removePaymentMirror(voucherId);
      return null;
    }
    return writePaymentMirror(mirror, voucherId);
  }
  return null;
}

/** The mirror row for a voucher, if it has one. */
export function findCashMirrorForVoucher(voucherType: "CR" | "CP", voucherId: number) {
  const conditions = and(
    eq(voucherType === "CR" ? cashReceipts.referenceType : cashPayments.referenceType, VOUCHER_MIRROR_REFERENCE),
    eq(voucherType === "CR" ? cashReceipts.referenceId : cashPayments.referenceId, voucherId),
  );
  return voucherType === "CR"
    ? db.select().from(cashReceipts).where(conditions).all()[0] ?? null
    : db.select().from(cashPayments).where(conditions).all()[0] ?? null;
}

/**
 * Gives every voucher that predates this sync its missing mirror, so existing
 * receipts and payments show up in Cash in Hand on upgrade rather than only
 * from the next write onwards. Runs once per process; safe to repeat.
 */
let backfillDone = false;
export function backfillCashMirrorsFromVouchers() {
  if (backfillDone) return;
  backfillDone = true;
  try {
    const vouchers = db.select().from(receiptVouchers).where(isNull(receiptVouchers.deletedAt)).all();
    if (vouchers.length === 0) return;
    const allLines = db.select().from(receiptVoucherLines).all();
    const linesByVoucher = new Map<number, ReceiptVoucherLine[]>();
    for (const line of allLines) {
      const bucket = linesByVoucher.get(line.voucherId);
      if (bucket) bucket.push(line);
      else linesByVoucher.set(line.voucherId, [line]);
    }
    const accountRows = db.select({ id: accounts.id, name: accounts.name, type: accounts.type }).from(accounts).all();
    const index = buildAccountIndex(accountRows);

    for (const voucher of vouchers) {
      const lines = linesByVoucher.get(voucher.id) ?? [];
      const mirror = buildMirror(voucher, lines, index);
      if (!mirror) continue;
      if (voucher.voucherType === "CR") writeReceiptMirror(mirror, voucher.id);
      else if (voucher.voucherType === "CP") writePaymentMirror(mirror, voucher.id);
    }
  } catch (error) {
    console.error("Cash mirror backfill failed", error);
  }
}