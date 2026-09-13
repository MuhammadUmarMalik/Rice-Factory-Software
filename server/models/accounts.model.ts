/**
 * Account persistence, extracted from the "// Accounts" section of storage.ts.
 *
 * Scope note: the "// Accounts" comment in storage.ts runs all the way to the
 * "// Products" comment and so nominally covers the ledger-posting internals
 * (postLedgerEntry, ensureSystemAccount, the fiscal-calendar bootstrap, the
 * posting guards). Those are transaction-scoped privates with 12+ call sites
 * across unrelated documents — moving them is a separate job. What lives here
 * is the account CRUD that IAccountsRepository actually describes, plus
 * recomputeAccountBalances, which updateAccount cannot work without.
 */
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { accounts, cashAccounts, ledgerEntries, type Account, type InsertAccount } from "../db/schema";
import { parseAmount } from "../utils/parse";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;

export type NormalSide = "DEBIT" | "CREDIT";

export function normalSideForAccountType(type: string | null | undefined): NormalSide {
  if (!type) return "DEBIT";
  const t = String(type).toLowerCase();
  if (["supplier", "liability", "equity", "income"].includes(t)) return "CREDIT";
  return "DEBIT";
}

export function ledgerSumByNormal(normal: NormalSide) {
  return sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = ${normal === "DEBIT" ? sql`'debit'` : sql`'credit'`} THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`;
}

/**
 * Rebuilds current balances from opening balance + ledger movement. Called
 * from storage.ts inside transactions, so the client stays an argument.
 */
export function recomputeAccountBalances(client: DbClient, accountIds: number[]) {
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

export async function getAccounts(type?: string, active?: boolean): Promise<Account[]> {
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

export async function getAccount(id: number): Promise<Account | undefined> {
  const [account] = db.select().from(accounts).where(eq(accounts.id, id)).all();
  return account;
}

export async function createAccount(account: InsertAccount): Promise<Account> {
  const [newAccount] = await db.insert(accounts).values({
    ...account,
    currentBalance: account.openingBalance || "0",
  }).returning();
  return newAccount;
}

/**
 * The cash account the Cash in Hand module reads its opening balance from.
 * Mirrors PRIMARY_CASH_ACCOUNT_ID in cash-in-hand.service.
 */
const PRIMARY_CASH_ACCOUNT_ID = 1;

/**
 * Keeps `cash_accounts` in step when the ledger's "Cash in Hand" account is
 * edited from the chart of accounts.
 *
 * updateCashAccountOpeningBalance already writes both tables when the figure is
 * set from the Cash in Hand page, but the sync was one-way: an edit made from
 * the accounts screen moved the ledger and left `cash_accounts` behind, so the
 * trial balance and the Cash in Hand page reported different opening balances.
 */
function syncCashModuleOpeningBalance(account: Account) {
  if (!account.isSystemAccount || account.name !== "Cash in Hand") return;
  db.update(cashAccounts)
    .set({ openingBalance: String(account.openingBalance ?? "0") })
    .where(eq(cashAccounts.id, PRIMARY_CASH_ACCOUNT_ID))
    .run();
}

export async function updateAccount(
  id: number,
  account: Partial<InsertAccount>,
): Promise<Account | undefined> {
  const [existing] = db.select().from(accounts).where(eq(accounts.id, id)).all();
  if (!existing) return undefined;

  const openingBalanceChanged =
    account.openingBalance !== undefined && account.openingBalance !== existing.openingBalance;
  const typeChanged = account.type !== undefined && account.type !== existing.type;

  const [updated] = await db.update(accounts).set(account).where(eq(accounts.id, id)).returning();
  if (!updated) return updated;

  if (openingBalanceChanged || typeChanged) {
    if (openingBalanceChanged) syncCashModuleOpeningBalance(updated);
    recomputeAccountBalances(db, [id]);
    const [refreshed] = db.select().from(accounts).where(eq(accounts.id, id)).all();
    return refreshed ?? updated;
  }

  return updated;
}

export async function deleteAccount(id: number): Promise<boolean> {
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
