/**
 * Journal voucher persistence, extracted from the "// Journal Vouchers" section
 * of storage.ts.
 *
 * This module and payroll.model import each other: approving a payroll posts a
 * journal voucher, and approving a journal voucher settles the matching payroll
 * row. Both directions are function calls made at runtime, never at module
 * load, so the ESM cycle resolves cleanly.
 */
import { db } from "./db";
import { eq, and, or, desc, inArray } from "drizzle-orm";
import {
  accounts,
  journalVouchers,
  journalVoucherEntries,
  ledgerEntries,
  cashTransactions,
  cashReceipts,
  cashPayments,
  payrolls,
  auditLogs,
  type JournalVoucher,
  type InsertJournalVoucher,
  type JournalVoucherEntry,
  type InsertJournalVoucherEntry,
} from "../db/schema";
import { parseAmount } from "../utils/parse";
import { assertPostingAllowed } from "../services/posting-guard.service";
import { buildJournalVoucherNarration as buildJournalVoucherNarrationText } from "../utils/narration";
import { nextDocumentSequence } from "./sequences.model";
import * as accountsModel from "./accounts.model";
import * as ledgerModel from "./ledger.model";
import { buildLedgerReferenceWhere, getLedgerReferenceColumns } from "./ledger.model";
import * as payrollModel from "./payroll.model";
import { insertVoucherAuditLog } from "../services/voucher-audit.service";

type DbClient = typeof db;

export type JournalEntryInput = Omit<InsertJournalVoucherEntry, "id" | "journalVoucherId">;

// Journal Vouchers
export async function getJournalVouchers(): Promise<(JournalVoucher & { entries: JournalVoucherEntry[] })[]> {
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

export async function getJournalVoucher(id: number): Promise<(JournalVoucher & { entries: JournalVoucherEntry[] }) | undefined> {
  const [voucher] = db.select().from(journalVouchers).where(eq(journalVouchers.id, id)).all();
  if (!voucher) return undefined;
  const entries = db.select().from(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, id)).all();
  return { ...voucher, entries };
}

export async function getNextJournalVoucherNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const nextNum = nextDocumentSequence("journal_vouchers", "voucher_no");
  return `JV-${year}-${String(nextNum).padStart(5, "0")}`;
}

export async function findDuplicateJournalVoucher(
  voucherDate: string | Date,
  debitAccountId: number,
  creditAccountId: number,
  amount: number,
  narration?: string,
  excludeId?: number,
): Promise<JournalVoucher | undefined> {
  const date = new Date(voucherDate);
  const [existing] = db
    .select()
    .from(journalVouchers)
    .where(
      and(
        eq(journalVouchers.voucherDate, date),
        eq(journalVouchers.totalAmount, amount.toString()),
        excludeId ? eq(journalVouchers.id, excludeId) : undefined,
      ),
    )
    .limit(1)
    .all();
  if (!existing) return undefined;
  const entries = db
    .select()
    .from(journalVoucherEntries)
    .where(eq(journalVoucherEntries.journalVoucherId, existing.id))
    .all();
  const hasDebit = entries.some((e) => e.accountId === debitAccountId && e.entryType === "debit");
  const hasCredit = entries.some((e) => e.accountId === creditAccountId && e.entryType === "credit");
  if (hasDebit && hasCredit) return existing;
  return undefined;
}

export function normalizeJournalEntries(entries: JournalEntryInput[]): { normalized: JournalEntryInput[]; total: number } {
  if (!entries || entries.length === 0) throw new Error("Journal entries are required");
  const normalized = entries.map((e) => ({
    ...e,
    entryType: (e.entryType || "debit").toLowerCase() as "debit" | "credit",
    amount: parseAmount(e.amount || "0").toString(),
  })).filter((e) => parseAmount(e.amount) > 0);

  const debitLines = normalized.filter((e) => e.entryType === "debit");
  const creditLines = normalized.filter((e) => e.entryType === "credit");

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

export function ensureAccountsExist(entries: JournalEntryInput[]) {
  for (const entry of entries) {
    const [account] = db.select().from(accounts).where(eq(accounts.id, entry.accountId)).all();
    if (!account) {
      throw new Error(`Invalid account selected (${entry.accountId})`);
    }
  }
}

export function postJournalToLedger(client: DbClient, voucher: JournalVoucher, entries: JournalEntryInput[]) {
  for (const entry of entries) {
    const amount = parseAmount(entry.amount || "0").toString();
    ledgerModel.postLedgerEntry(client, {
      accountId: entry.accountId,
      transactionType: entry.entryType,
      amount,
      description: voucher.narration || `Journal Voucher #${voucher.voucherNo}`,
      ...getLedgerReferenceColumns("journal_voucher", voucher.id),
      entryDate: voucher.voucherDate ? new Date(voucher.voucherDate as any) : new Date(),
    });
  }
}

export async function createJournalVoucher(data: InsertJournalVoucher, entries: JournalEntryInput[]): Promise<JournalVoucher> {
  ensureAccountsExist(entries);
  const { normalized, total } = normalizeJournalEntries(entries);

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = data.voucherDate ? new Date(data.voucherDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "journal voucher");

    const year = new Date().getFullYear();
    const nextNum = nextDocumentSequence("journal_vouchers", "voucher_no");
    const generatedNo = `JV-${year}-${String(nextNum).padStart(5, "0")}`;
    const voucherNo = (data as any).voucherNo && (data as any).voucherNo !== "" ? (data as any).voucherNo : generatedNo;

    const debitLine = normalized.find((entry) => entry.entryType === "debit");
    const creditLine = normalized.find((entry) => entry.entryType === "credit");
    const accountRows = client
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(inArray(accounts.id, [debitLine!.accountId, creditLine!.accountId]))
      .all();
    const accountNameById = new Map(accountRows.map((account) => [account.id, account.name]));
    const resolvedNarration = buildJournalVoucherNarrationText({
      narration: data.narration,
      voucherNumber: voucherNo,
      debitAccount: accountNameById.get(debitLine!.accountId),
      creditAccount: accountNameById.get(creditLine!.accountId),
    });

    const status = (data.status || "draft") as "draft" | "approved";

    const voucher = tx.insert(journalVouchers).values({
      ...data,
      narration: resolvedNarration,
      voucherNo,
      voucherDate: postingDate,
      totalAmount: total.toString(),
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
      postJournalToLedger(client, voucher, normalized);

    const debitLine = normalized.find((e) => e.entryType === "debit");
    const creditLine = normalized.find((e) => e.entryType === "credit");
    if (debitLine && creditLine) {
      const [debitAcc] = tx.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.id, debitLine.accountId)).limit(1).all();
      const [creditAcc] = tx.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.id, creditLine.accountId)).limit(1).all();
      if (creditAcc && String(creditAcc.type).toLowerCase() === "employee") {
        payrollModel.autoMarkPayrollApprovedForEmployee(client, {
          employeeAccountId: creditAcc.id,
          amount: parseAmount(creditLine.amount || "0"),
          postingDate,
          journalVoucherId: voucher.id,
          source: `journal_voucher:${voucher.id}`,
          actorUserId: (data as any).createdBy ?? undefined,
        });
      }
      if (debitAcc && String(debitAcc.type).toLowerCase() === "employee") {
        const method = String(creditAcc?.type || "").toLowerCase() === "bank" ? "Bank" : "Cash";
        payrollModel.autoMarkPayrollPaidForEmployee(client, {
          employeeAccountId: debitAcc.id,
          amount: parseAmount(debitLine.amount || "0"),
            paymentDate: postingDate,
            method,
            paymentJournalVoucherId: voucher.id,
            source: `journal_voucher:${voucher.id}`,
            actorUserId: (data as any).createdBy ?? undefined,
          });
        }
      }
    }

    insertVoucherAuditLog("journal_voucher", voucher.id, "create", null, voucher, (data as any).createdBy);

    return voucher;
  });
}

export async function updateJournalVoucher(id: number, data: Partial<InsertJournalVoucher>, entries: JournalEntryInput[]): Promise<JournalVoucher | undefined> {
  const existing = await getJournalVoucher(id);
  if (!existing) return undefined;

  ensureAccountsExist(entries);
  const { normalized, total } = normalizeJournalEntries(entries);

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const isApproved = existing.status === "approved";
    if (isApproved) {
      const linkedPayroll = tx
        .select({ id: payrolls.id })
        .from(payrolls)
        .where(or(eq(payrolls.journalVoucherId, id), eq(payrolls.paymentJournalVoucherId, id)))
        .limit(1)
        .all();
      if (linkedPayroll.length) {
        throw new Error("Approved voucher is linked with payroll and cannot be edited");
      }
      const linkedCashTx = tx
        .select({ id: cashTransactions.id })
        .from(cashTransactions)
        .where(eq(cashTransactions.journalVoucherId, id))
        .limit(1)
        .all();
      const linkedCashReceipt = tx
        .select({ id: cashReceipts.id })
        .from(cashReceipts)
        .where(and(eq(cashReceipts.referenceType, "journal"), eq(cashReceipts.referenceId, id)))
        .limit(1)
        .all();
      const linkedCashPayment = tx
        .select({ id: cashPayments.id })
        .from(cashPayments)
        .where(and(eq(cashPayments.referenceType, "journal"), eq(cashPayments.referenceId, id)))
        .limit(1)
        .all();
      if (linkedCashTx.length || linkedCashReceipt.length || linkedCashPayment.length) {
        throw new Error("Approved voucher has linked cash entries and cannot be edited");
      }
    }

    const priorLedgerEntries = isApproved
      ? tx.select().from(ledgerEntries).where(buildLedgerReferenceWhere("journal_voucher", id) as any).all()
      : [];
    const affectedAccountIds = Array.from(
      new Set([
        ...priorLedgerEntries.map((entry) => entry.accountId),
        ...normalized.map((entry) => entry.accountId),
      ]),
    );
    if (isApproved) {
      tx.delete(ledgerEntries).where(buildLedgerReferenceWhere("journal_voucher", id) as any).run();
    }

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
      updatedAt: new Date(),
    }).where(eq(journalVouchers.id, id)).returning().all();

    if (isApproved) {
      postJournalToLedger(client, { ...existing, ...updated }, normalized);

      const debitLine = normalized.find((e) => e.entryType === "debit");
      const creditLine = normalized.find((e) => e.entryType === "credit");
      if (debitLine && creditLine) {
        const [debitAcc] = tx.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.id, debitLine.accountId)).limit(1).all();
        const [creditAcc] = tx.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.id, creditLine.accountId)).limit(1).all();
        if (creditAcc && String(creditAcc.type).toLowerCase() === "employee") {
          payrollModel.autoMarkPayrollApprovedForEmployee(client, {
            employeeAccountId: creditAcc.id,
            amount: parseAmount(creditLine.amount || "0"),
            postingDate: updated.voucherDate ? new Date(updated.voucherDate as any) : new Date(),
            journalVoucherId: id,
            source: `journal_voucher:${id}`,
            actorUserId: (data as any).createdBy ?? undefined,
          });
        }
        if (debitAcc && String(debitAcc.type).toLowerCase() === "employee") {
          const method = String(creditAcc?.type || "").toLowerCase() === "bank" ? "Bank" : "Cash";
          payrollModel.autoMarkPayrollPaidForEmployee(client, {
            employeeAccountId: debitAcc.id,
            amount: parseAmount(debitLine.amount || "0"),
            paymentDate: updated.voucherDate ? new Date(updated.voucherDate as any) : new Date(),
            method,
            paymentJournalVoucherId: id,
            source: `journal_voucher:${id}`,
            actorUserId: (data as any).createdBy ?? undefined,
          });
        }
      }
    }
    accountsModel.recomputeAccountBalances(client, affectedAccountIds);

    insertVoucherAuditLog("journal_voucher", id, "update", existing, updated, (data as any).createdBy);

    return updated;
  });
}

export async function approveJournalVoucher(id: number, approverId?: number): Promise<JournalVoucher | undefined> {
  const existing = await getJournalVoucher(id);
  if (!existing) return undefined;
  if (existing.status === "approved") return existing;

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const entries = tx.select().from(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, id)).all();
    ensureAccountsExist(entries);
    const { total } = normalizeJournalEntries(entries);
    const postingDate = existing.voucherDate ? new Date(existing.voucherDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "journal voucher approval");

    const [updated] = tx.update(journalVouchers).set({
      status: "approved",
      approvedBy: approverId ?? existing.approvedBy,
      totalAmount: total.toString(),
      updatedAt: new Date(),
    }).where(eq(journalVouchers.id, id)).returning().all();

    postJournalToLedger(client, { ...existing, ...updated }, entries);

    const debitLine = entries.find((e) => String(e.entryType).toLowerCase() === "debit");
    const creditLine = entries.find((e) => String(e.entryType).toLowerCase() === "credit");
    if (debitLine && creditLine) {
      const [debitAcc] = tx.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.id, debitLine.accountId)).limit(1).all();
      const [creditAcc] = tx.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.id, creditLine.accountId)).limit(1).all();
      if (creditAcc && String(creditAcc.type).toLowerCase() === "employee") {
        payrollModel.autoMarkPayrollApprovedForEmployee(client, {
          employeeAccountId: creditAcc.id,
          amount: parseAmount(creditLine.amount || "0"),
          postingDate,
          journalVoucherId: id,
          source: `journal_voucher:${id}`,
          actorUserId: approverId,
        });
      }
      if (debitAcc && String(debitAcc.type).toLowerCase() === "employee") {
        const method = String(creditAcc?.type || "").toLowerCase() === "bank" ? "Bank" : "Cash";
        payrollModel.autoMarkPayrollPaidForEmployee(client, {
          employeeAccountId: debitAcc.id,
          amount: parseAmount(debitLine.amount || "0"),
          paymentDate: postingDate,
          method,
          paymentJournalVoucherId: id,
          source: `journal_voucher:${id}`,
          actorUserId: approverId,
        });
      }
    }

    insertVoucherAuditLog("journal_voucher", id, "update", existing, updated, approverId);

    return updated;
  });
}

export async function deleteJournalVoucher(id: number): Promise<boolean> {
  const existing = await getJournalVoucher(id);
  if (!existing) return false;

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const isApproved = existing.status === "approved";
    if (isApproved) {
      const linkedPayroll = tx
        .select()
        .from(payrolls)
        .where(or(eq(payrolls.journalVoucherId, id), eq(payrolls.paymentJournalVoucherId, id)))
        .all();

      for (const p of linkedPayroll) {
        const touchesAccrual = p.journalVoucherId === id;
        const touchesPayment = p.paymentJournalVoucherId === id;

        if (touchesAccrual && p.status === "paid" && p.paymentJournalVoucherId !== id) {
          throw new Error("Payroll is already paid against a different payment JV. Delete payment JV first.");
        }

        if (touchesPayment && p.status === "paid") {
          tx
            .update(payrolls)
            .set({
              status: "approved",
              paymentMethod: null,
              paymentAccountId: null,
              paidAt: null,
              paymentJournalVoucherId: null,
              updatedAt: new Date(),
            } as any)
            .where(eq(payrolls.id, p.id))
            .run();
          tx.insert(auditLogs).values({
            entity: "payroll",
            entityId: p.id,
            action: "updated",
            afterJson: JSON.stringify({
              source: `journal_voucher:${id}`,
              rollback: "payment_deleted",
            }),
            source: "payroll",
          } as any).run();
        }

        if (touchesAccrual && p.status !== "paid") {
          tx
            .update(payrolls)
            .set({
              status: "generated",
              approvedBy: null,
              approvedByRole: null,
              approvedAt: null,
              journalVoucherId: null,
              updatedAt: new Date(),
            } as any)
            .where(eq(payrolls.id, p.id))
            .run();
          tx.insert(auditLogs).values({
            entity: "payroll",
            entityId: p.id,
            action: "updated",
            afterJson: JSON.stringify({
              source: `journal_voucher:${id}`,
              rollback: "accrual_deleted",
            }),
            source: "payroll",
          } as any).run();
        }
      }
    }

    // Remove cash module rows derived from this JV before deleting the voucher.
    tx
      .delete(cashReceipts)
      .where(and(eq(cashReceipts.referenceType, "journal"), eq(cashReceipts.referenceId, id)))
      .run();
    tx
      .delete(cashPayments)
      .where(and(eq(cashPayments.referenceType, "journal"), eq(cashPayments.referenceId, id)))
      .run();
    tx
      .delete(cashTransactions)
      .where(eq(cashTransactions.journalVoucherId, id))
      .run();

    const priorEntries = tx
      .select()
      .from(ledgerEntries)
      .where(buildLedgerReferenceWhere("journal_voucher", id) as any)
      .all();
    const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
    tx.delete(ledgerEntries).where(buildLedgerReferenceWhere("journal_voucher", id) as any).run();
    tx.delete(journalVoucherEntries).where(eq(journalVoucherEntries.journalVoucherId, id)).run();
    tx.delete(journalVouchers).where(eq(journalVouchers.id, id)).run();
    accountsModel.recomputeAccountBalances(client, affectedAccountIds);

    insertVoucherAuditLog("journal_voucher", id, "delete", existing, null, undefined);

    return true;
  });
}
