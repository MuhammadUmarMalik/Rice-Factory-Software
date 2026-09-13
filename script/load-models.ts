/**
 * Lazily loads every domain model module and flattens them into one object.
 *
 * The narration test scripts copy .local/data.db to a temp file and set
 * DATABASE_URL before touching any server module, so the imports have to stay
 * dynamic — server/models/db opens the database at import time.
 *
 * This replaces the old `storage` facade those scripts imported. The model
 * modules export disjoint names, so spreading them reproduces the same flat
 * call surface (`models.getDayBook(...)`) the scripts were written against.
 */
export async function loadModels() {
  const [
    accounts,
    expenses,
    fiscalYears,
    journalVouchers,
    ledger,
    notifications,
    payroll,
    periodLocks,
    processing,
    products,
    purchases,
    reports,
    sales,
    users,
  ] = await Promise.all([
    import("../server/models/accounts.model"),
    import("../server/models/expenses.model"),
    import("../server/models/fiscal-years.model"),
    import("../server/models/journal-vouchers.model"),
    import("../server/models/ledger.model"),
    import("../server/models/notifications.model"),
    import("../server/models/payroll.model"),
    import("../server/models/period-locks.model"),
    import("../server/models/processing.model"),
    import("../server/models/products.model"),
    import("../server/models/purchases.model"),
    import("../server/models/reports.model"),
    import("../server/models/sales.model"),
    import("../server/models/users.model"),
  ]);

  return {
    ...accounts,
    ...expenses,
    ...fiscalYears,
    ...journalVouchers,
    ...ledger,
    ...notifications,
    ...payroll,
    ...periodLocks,
    ...processing,
    ...products,
    ...purchases,
    ...reports,
    ...sales,
    ...users,
  };
}
