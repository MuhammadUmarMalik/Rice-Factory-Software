/**
 * Shared classification of Chart-of-Accounts rows into cash / bank accounts.
 *
 * Previously each report inlined its own predicate, and every copy contained
 * `isSystemAccount && type === "asset"` as an "is system cash" test. That is
 * wrong: every seeded balance-sheet asset (Inventory, Tax Input, ...) is a
 * system asset account, so those balances leaked into the Day Book opening
 * balance, the cash receipt/payment columns and the dashboard cash figure.
 *
 * A cash/bank account is identified by what it *is*, not by whether it was
 * seeded: an asset account whose name marks it as cash or a bank. Keep the
 * matching here so a site that adds a second drawer ("Cash - Branch 2") or a
 * bank ("HBL Bank") is picked up everywhere at once.
 */

export type AccountLike = {
  id?: number;
  name?: string | null;
  type?: string | null;
  isSystemAccount?: boolean | null;
};

const CASH_NAME_PATTERN = /\bcash\b/i;
const BANK_NAME_PATTERN = /\bbank\b/i;

/** Accounts that hold physical cash (drawer / till). */
export function isCashAccount(account: AccountLike): boolean {
  const name = account.name || "";
  if (!CASH_NAME_PATTERN.test(name)) return false;
  // "Cash Sales" style income accounts and "Cash Discount" expenses are not
  // cash holdings — only asset-side accounts are.
  return isAssetLike(account.type);
}

/** Accounts that hold bank balances. */
export function isBankAccount(account: AccountLike): boolean {
  if (account.type === "bank") return true;
  if (!BANK_NAME_PATTERN.test(account.name || "")) return false;
  return isAssetLike(account.type);
}

/** Cash *or* bank — the set that makes up the Day Book / cash flow balance. */
export function isCashOrBankAccount(account: AccountLike): boolean {
  return isCashAccount(account) || isBankAccount(account);
}

function isAssetLike(type?: string | null): boolean {
  return type === "asset" || type === "bank" || type === "cash";
}

/** Ids of every cash/bank account in the given chart of accounts. */
export function cashOrBankAccountIds(accountsList: AccountLike[]): number[] {
  return accountsList.filter(isCashOrBankAccount).map((a) => a.id!).filter((id) => id != null);
}

/** Ids of cash-only accounts (excludes banks). */
export function cashAccountIds(accountsList: AccountLike[]): number[] {
  return accountsList.filter(isCashAccount).map((a) => a.id!).filter((id) => id != null);
}

/** Ids of bank-only accounts. */
export function bankAccountIds(accountsList: AccountLike[]): number[] {
  return accountsList.filter(isBankAccount).map((a) => a.id!).filter((id) => id != null);
}
