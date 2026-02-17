/**
 * Centralized query key factory for consistent cache keys and invalidation.
 * Use these with useQuery/useMutation for predictable cache behavior.
 */

export const apiKeys = {
  all: ["/api"] as const,

  // Auth
  auth: {
    me: ["/api/auth/me"] as const,
  },

  // Accounts (filtered by type/active)
  accounts: (params?: { type?: string; active?: boolean }) =>
    params?.type
      ? params.active !== undefined
        ? ([`/api/accounts?type=${params.type}&active=${params.active}`] as const)
        : ([`/api/accounts?type=${params.type}`] as const)
      : (["/api/accounts"] as const),
  account: (id: number) => [`/api/accounts/${id}`] as const,

  // Products
  products: ["/api/products"] as const,
  product: (id: number) => [`/api/products/${id}`] as const,

  // Purchases
  purchases: ["/api/purchases"] as const,
  purchase: (id: number) => [`/api/purchases/${id}`] as const,
  purchasesNextBill: ["/api/purchases/next-bill-number"] as const,

  // Sales
  sales: ["/api/sales"] as const,
  sale: (id: number) => [`/api/sales/${id}`] as const,

  // Processing
  processing: ["/api/processing"] as const,
  processingBatch: (id: number) => [`/api/processing/${id}`] as const,

  // Receipts & Payments
  receipts: ["/api/receipts"] as const,
  receipt: (id: number) => [`/api/receipts/${id}`] as const,
  payments: ["/api/payments"] as const,
  payment: (id: number) => [`/api/payments/${id}`] as const,

  // Expenses
  expenses: ["/api/expenses"] as const,
  expense: (id: number) => [`/api/expenses/${id}`] as const,

  // Journal
  journalVouchers: ["/api/journal-vouchers"] as const,
  journalVoucher: (id: number) => [`/api/journal-vouchers/${id}`] as const,

  // Reports (with params for cache granularity)
  reports: {
    stock: (params?: Record<string, unknown>) =>
      ["/api/reports/stock", params] as const,
    purchases: (params?: Record<string, unknown>) =>
      ["/api/reports/purchases", params] as const,
    sales: (params?: Record<string, unknown>) =>
      ["/api/reports/sales", params] as const,
    trialBalance: (asOfDate?: string) =>
      ["/api/reports/trial-balance", asOfDate] as const,
    profitLoss: (fromDate?: string, toDate?: string) =>
      ["/api/reports/profit-loss", fromDate, toDate] as const,
    grossProfit: (fromDate?: string, toDate?: string) =>
      ["/api/reports/gross-profit", fromDate, toDate] as const,
    dayBook: (date?: string) => ["/api/reports/day-book", date] as const,
    periodPurchases: (params?: Record<string, unknown>) =>
      ["/api/reports/period-purchases", params] as const,
    periodSales: (params?: Record<string, unknown>) =>
      ["/api/reports/period-sales", params] as const,
    outstandingCustomers: (asOfDate?: string, customerId?: number) =>
      ["/api/reports/outstanding-customers", asOfDate, customerId] as const,
    outstandingSuppliers: (asOfDate?: string, supplierId?: number) =>
      ["/api/reports/outstanding-suppliers", asOfDate, supplierId] as const,
    bardana: (params?: Record<string, unknown>) =>
      ["/api/reports/bardana", params] as const,
    less: (params?: Record<string, unknown>) =>
      ["/api/reports/less", params] as const,
  },

  // Financial
  financial: {
    incomeStatement: (fromDate?: string, toDate?: string) =>
      ["/api/financial/income-statement", fromDate, toDate] as const,
    balanceSheet: (asOfDate?: string) =>
      ["/api/financial/balance-sheet", asOfDate] as const,
    capital: (fromDate?: string, toDate?: string) =>
      ["/api/financial/capital", fromDate, toDate] as const,
    salary: (fromDate?: string, toDate?: string) =>
      ["/api/financial/salary", fromDate, toDate] as const,
  },

  // Ledger
  ledger: (params?: Record<string, unknown>) =>
    ["/api/ledger", params] as const,

  // Dashboard
  dashboard: {
    summary: (type: string, params?: Record<string, unknown>) =>
      ["/api/dashboard/summary", type, params] as const,
    alerts: (params?: Record<string, unknown>) =>
      ["/api/dashboard/alerts", params] as const,
    charts: (params?: Record<string, unknown>) =>
      ["/api/dashboard/charts", params] as const,
  },

  // Settings
  settings: ["/api/settings"] as const,
  settingsSummary: ["/api/settings/summary"] as const,

  // Data management
  dataSummary: ["/api/data/summary"] as const,

  // Users
  users: ["/api/users"] as const,
};
