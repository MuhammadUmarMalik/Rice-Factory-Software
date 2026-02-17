export const docKeys = {
  salesInvoice: "invoice.sales",
  purchaseInvoice: "invoice.purchase",
  cashReceiptVoucher: "voucher.cashReceipt",
  cashPaymentVoucher: "voucher.cashPayment",
  journalVoucher: "voucher.journal",
  stockReport: "report.stock",
  purchaseReport: "report.purchases",
  salesReport: "report.sales",
  bardanaReport: "report.bardana",
  lessReport: "report.less",
  periodPurchases: "report.periodPurchases",
  periodSales: "report.periodSales",
  grossProfit: "report.grossProfit",
  dayBook: "report.dayBook",
  outstandingCustomers: "report.outstandingCustomers",
  outstandingSuppliers: "report.outstandingSuppliers",
  ledger: "report.ledger",
  trialBalance: "report.trialBalance",
  balanceSheet: "statement.balanceSheet",
  incomeStatement: "statement.incomeStatement",
  profitLoss: "statement.profitLoss",
  capital: "statement.capital",
  salary: "report.salary",
} as const;

export type DocKey = typeof docKeys[keyof typeof docKeys];

