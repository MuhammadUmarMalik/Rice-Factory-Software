/**
 * Expense voucher persistence, extracted from the "// Expense entries" section
 * of storage.ts.
 *
 * An expense is a two-line journal: Dr the expense account, Cr the account it
 * was paid from. The voucher row and both ledger lines are written in one
 * transaction so a half-posted expense can never survive a failure.
 *
 * Edits and deletes use the reverse-then-reapply pattern the rest of the
 * codebase follows: drop the prior ledger lines (and any cash projection),
 * recompute the balances of every account they touched, then post afresh.
 * Recomputing before re-posting matters — the accounts on the old lines may
 * not be the accounts on the new ones.
 */
import { db } from "./db";
import { desc, eq } from "drizzle-orm";
import {
  accounts,
  cashTransactions,
  expenseEntries,
  ledgerEntries,
  type ExpenseEntry,
  type InsertExpenseEntry,
} from "../db/schema";
import { parseAmount } from "../utils/parse";
import { buildExpenseNarration as buildExpenseNarrationText } from "../utils/narration";
import { assertPostingAllowed } from "../services/posting-guard.service";
import { postLedgerEntry } from "./ledger.model";
import { recomputeAccountBalances } from "./accounts.model";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;

type PerformedBy = { userId?: number; role?: string };

export async function getExpenses(): Promise<ExpenseEntry[]> {
  return db.select().from(expenseEntries).orderBy(desc(expenseEntries.expenseDate)).all();
}

export async function getExpense(id: number): Promise<ExpenseEntry | undefined> {
  const [expense] = db.select().from(expenseEntries).where(eq(expenseEntries.id, id)).all();
  return expense;
}

function nextExpenseNumber(client: DbClient): string {
  const year = new Date().getFullYear();
  const [last] = client.select().from(expenseEntries).orderBy(desc(expenseEntries.id)).limit(1).all();
  const next = last ? parseInt((last.voucherNo || "").split("-").pop() || "0") + 1 : 1;
  return `EXP-${year}-${String(next).padStart(5, "0")}`;
}

export async function createExpense(
  expense: InsertExpenseEntry,
  performedBy?: PerformedBy,
): Promise<ExpenseEntry> {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = expense.expenseDate ? new Date(expense.expenseDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "expense");

    const [expAcc] = client.select().from(accounts).where(eq(accounts.id, expense.expenseAccountId)).all();
    if (!expAcc || String(expAcc.type).toLowerCase() !== "expense") throw new Error("Expense account must be of type expense");
    const [payAcc] = client.select().from(accounts).where(eq(accounts.id, expense.payFromAccountId)).all();
    if (!payAcc) throw new Error("Pay-from account not found");

    const voucherNo = nextExpenseNumber(client);
    const amount = parseAmount(expense.amount || "0");
    if (amount <= 0) throw new Error("Amount must be greater than zero");
    const narration = buildExpenseNarrationText({
      description: expense.description,
      expenseAccount: expAcc.name,
      voucherNumber: voucherNo,
      purpose: (expense as any).purpose,
    });

    const created = client.insert(expenseEntries).values({
      ...expense,
      description: narration,
      voucherNo,
      amount: amount.toString(),
      expenseDate: postingDate,
      createdBy: performedBy?.userId,
      createdAt: new Date(),
    } as any).returning().get();

    // Dr Expense, Cr Cash/Bank/Other
    postLedgerEntry(client, {
      accountId: expense.expenseAccountId,
      transactionType: "debit",
      amount: amount.toString(),
      description: narration,
      expenseEntryId: created.id,
      entryDate: postingDate,
    });
    postLedgerEntry(client, {
      accountId: expense.payFromAccountId,
      transactionType: "credit",
      amount: amount.toString(),
      description: narration,
      expenseEntryId: created.id,
      entryDate: postingDate,
    });

    return created as any;
  });
}

export async function updateExpense(
  id: number,
  expense: Partial<InsertExpenseEntry>,
  performedBy?: PerformedBy,
): Promise<ExpenseEntry | undefined> {
  const existing = await getExpense(id);
  if (!existing) return undefined;

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = expense.expenseDate
      ? new Date(expense.expenseDate as any)
      : existing.expenseDate
        ? new Date(existing.expenseDate as any)
        : new Date();
    assertPostingAllowed(client, postingDate, "expense");

    const expenseAccountId = expense.expenseAccountId ?? existing.expenseAccountId;
    const payFromAccountId = expense.payFromAccountId ?? existing.payFromAccountId;

    const [expAcc] = client.select().from(accounts).where(eq(accounts.id, expenseAccountId)).all();
    if (!expAcc || String(expAcc.type).toLowerCase() !== "expense") throw new Error("Expense account must be of type expense");
    const [payAcc] = client.select().from(accounts).where(eq(accounts.id, payFromAccountId)).all();
    if (!payAcc) throw new Error("Pay-from account not found");

    const amount = parseAmount(expense.amount ?? existing.amount ?? "0");
    if (amount <= 0) throw new Error("Amount must be greater than zero");
    const narration = expense.description === undefined
      ? existing.description
      : buildExpenseNarrationText({
          description: expense.description,
          expenseAccount: expAcc.name,
          voucherNumber: existing.voucherNo,
          purpose: (expense as any).purpose,
        });

    const priorEntries = tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.expenseEntryId, id))
      .all();
    const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
    tx.delete(cashTransactions)
      .where(eq(cashTransactions.expenseEntryId, id))
      .run();
    tx.delete(ledgerEntries)
      .where(eq(ledgerEntries.expenseEntryId, id))
      .run();
    recomputeAccountBalances(client, affectedAccountIds);

    const updated = tx.update(expenseEntries).set({
      ...expense,
      description: narration,
      expenseAccountId,
      payFromAccountId,
      amount: amount.toString(),
      expenseDate: postingDate,
      createdBy: existing.createdBy ?? performedBy?.userId,
    }).where(eq(expenseEntries.id, id)).returning().get();

    postLedgerEntry(client, {
      accountId: expenseAccountId,
      transactionType: "debit",
      amount: amount.toString(),
      description: narration || `Expense — ${expAcc.name} — Voucher #${existing.voucherNo}`,
      expenseEntryId: id,
      entryDate: postingDate,
    });
    postLedgerEntry(client, {
      accountId: payFromAccountId,
      transactionType: "credit",
      amount: amount.toString(),
      description: narration || `Expense — ${expAcc.name} — Voucher #${existing.voucherNo}`,
      expenseEntryId: id,
      entryDate: postingDate,
    });

    return updated as any;
  });
}

export async function deleteExpense(id: number): Promise<boolean> {
  const existing = await getExpense(id);
  if (!existing) return false;

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const postingDate = existing.expenseDate ? new Date(existing.expenseDate as any) : new Date();
    assertPostingAllowed(client, postingDate, "expense");

    const priorEntries = tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.expenseEntryId, id))
      .all();
    const affectedAccountIds = Array.from(new Set(priorEntries.map((entry) => entry.accountId)));
    tx.delete(cashTransactions)
      .where(eq(cashTransactions.expenseEntryId, id))
      .run();
    tx.delete(ledgerEntries)
      .where(eq(ledgerEntries.expenseEntryId, id))
      .run();
    recomputeAccountBalances(client, affectedAccountIds);
    tx.delete(expenseEntries).where(eq(expenseEntries.id, id)).run();
    return true;
  });
}
