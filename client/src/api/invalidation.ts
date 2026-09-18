import { queryClient } from "@/lib/queryClient";

/**
 * Scoped cache invalidation.
 *
 * Every mutation used to fall through to the MutationCache in lib/queryClient.ts,
 * which invalidates *every* key starting with "/api/" — one saved sale refetched
 * the whole application. Migrated mutations declare
 * `meta: { scopedInvalidation: true }` and call `invalidateApi()` with the groups
 * below instead; the global fallback still covers everything not yet migrated.
 *
 * Prefixes matter because several keys are single strings carrying a query
 * string — "/api/accounts?type=customer&active=true" is a *different* top-level
 * key from "/api/accounts", so an exact-key invalidation would leave the customer
 * and supplier dropdowns stale. `invalidateApi` matches on the path prefix and
 * catches both.
 */

/**
 * Invalidates every cached query whose first key segment is one of `prefixes`,
 * or a path/query-string extension of one ("/api/accounts" also matches
 * "/api/accounts/5" and "/api/accounts?type=customer").
 */
export function invalidateApi(prefixes: readonly string[]) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      if (typeof key !== "string") return false;
      return prefixes.some(
        (prefix) => key === prefix || key.startsWith(`${prefix}/`) || key.startsWith(`${prefix}?`),
      );
    },
  });
}

/**
 * What each kind of write actually affects. Keep these lists honest: queries use
 * `staleTime: Infinity`, so anything omitted here keeps serving cached data until
 * it is garbage-collected, while anything added back costs a refetch.
 */
export const invalidationGroups = {
  /**
   * A sale moves stock, the customer's balance, cash/bank when it is paid, and
   * every revenue-side report. It does not touch purchases, processing, payroll,
   * users or settings.
   */
  sales: [
    "/api/sales",
    "/api/products",
    "/api/accounts",
    "/api/dashboard",
    "/api/cash",
    "/api/ledger",
    "/api/financial",
    "/api/reports/sales",
    "/api/reports/period-sales",
    "/api/reports/gross-profit",
    "/api/reports/outstanding-customers",
    "/api/reports/stock",
    "/api/reports/trial-balance",
    "/api/reports/profit-loss",
    "/api/reports/day-book",
  ],

  /** Mirror image of `sales` on the buying side, plus the bardana/less reports. */
  purchases: [
    "/api/purchases",
    "/api/products",
    "/api/accounts",
    "/api/dashboard",
    "/api/cash",
    "/api/ledger",
    "/api/financial",
    "/api/reports/purchases",
    "/api/reports/period-purchases",
    "/api/reports/gross-profit",
    "/api/reports/outstanding-suppliers",
    "/api/reports/stock",
    "/api/reports/bardana",
    "/api/reports/less",
    "/api/reports/trial-balance",
    "/api/reports/profit-loss",
    "/api/reports/day-book",
  ],

  /**
   * A payment voucher settles supplier bills: it changes the voucher list, the
   * account balances it debits/credits, the paid/balance columns on purchases and
   * every cash and ledger view. Stock is untouched.
   */
  payments: [
    "/api/payments",
    "/api/purchases",
    "/api/accounts",
    "/api/dashboard",
    "/api/cash",
    "/api/ledger",
    "/api/financial",
    "/api/reports/outstanding-suppliers",
    "/api/reports/trial-balance",
    "/api/reports/day-book",
  ],

  /** Receipt vouchers: the mirror of `payments` on the customer side. */
  receipts: [
    "/api/receipts",
    "/api/sales",
    "/api/accounts",
    "/api/dashboard",
    "/api/cash",
    "/api/ledger",
    "/api/financial",
    "/api/reports/outstanding-customers",
    "/api/reports/trial-balance",
    "/api/reports/day-book",
  ],

  /** Expense vouchers hit an expense head, cash/bank and the P&L. No stock. */
  expenses: [
    "/api/expenses",
    "/api/accounts",
    "/api/dashboard",
    "/api/cash",
    "/api/ledger",
    "/api/financial",
    "/api/reports/trial-balance",
    "/api/reports/profit-loss",
    "/api/reports/day-book",
  ],

  /**
   * A journal voucher can debit or credit any account, so it invalidates every
   * balance-derived view — but still not stock, sales or purchase documents.
   */
  journal: [
    "/api/journal-vouchers",
    "/api/payrolls",
    "/api/accounts",
    "/api/dashboard",
    "/api/cash",
    "/api/ledger",
    "/api/financial",
    "/api/reports/trial-balance",
    "/api/reports/profit-loss",
    "/api/reports/day-book",
  ],

  /** Processing converts paddy into rice/broken: stock and its valuation move. */
  processing: [
    "/api/processing",
    "/api/products",
    "/api/dashboard",
    "/api/ledger",
    "/api/financial",
    "/api/reports/stock",
    "/api/reports/trial-balance",
  ],

  /** Catalogue edits and opening stock; no ledger posting of their own. */
  products: ["/api/products", "/api/dashboard", "/api/reports/stock"],

  /**
   * Customers, suppliers, banks and expense heads all live in /api/accounts, and
   * the list is cached under several query-string variants at once.
   */
  accounts: [
    "/api/accounts",
    "/api/dashboard",
    "/api/ledger",
    "/api/financial",
    "/api/reports/outstanding-customers",
    "/api/reports/outstanding-suppliers",
    "/api/reports/trial-balance",
  ],

  /** Payroll generate/approve/pay all post journal entries and move cash. */
  payroll: [
    "/api/payrolls",
    "/api/employees",
    "/api/journal-vouchers",
    "/api/accounts",
    "/api/dashboard",
    "/api/cash",
    "/api/ledger",
    "/api/financial",
    "/api/reports/trial-balance",
    "/api/reports/day-book",
    "/api/reports/salary-account",
  ],

  /** Employee records and salary structures; nothing is posted until payroll runs. */
  employees: ["/api/employees", "/api/payrolls", "/api/financial/salary"],

  /** The cash daybook screens. */
  cash: [
    "/api/cash",
    "/api/accounts",
    "/api/dashboard",
    "/api/ledger",
    "/api/financial",
    "/api/reports/trial-balance",
    "/api/reports/day-book",
  ],

  /** Settings, including the shortcut map and the data-management summary. */
  settings: ["/api/settings", "/api/data"],

  users: ["/api/users"],

  notifications: ["/api/notifications"],
} as const;

/** Marks a mutation as handling its own invalidation. See lib/queryClient.ts. */
export const scopedInvalidation = { scopedInvalidation: true } as const;
