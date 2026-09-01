import type { PrintableDocumentPayload } from "../../types/print";
import { Roles } from "../../utils/roles";
import {
  mapBardanaReport,
  mapBalanceSheet,
  mapCapital,
  mapCashVoucher,
  mapCashJournalVoucher,
  mapCashModuleReceipt,
  mapCashModulePayment,
  mapExpenseVoucher,
  mapProcessingVoucher,
  mapDayBook,
  mapGrossProfit,
  mapIncomeStatement,
  mapJournalVoucher,
  mapLedgerReport,
  mapLessReport,
  mapOutstandingCustomers,
  mapOutstandingSuppliers,
  mapPeriodPurchases,
  mapPeriodSales,
  mapProfitLoss,
  mapPurchaseInvoice,
  mapPurchaseReport,
  mapSalary,
  mapSalesInvoice,
  mapSalesReport,
  mapStockReport,
  mapTrialBalance,
} from "./mappers";

export type PrintContext = {
  company: PrintableDocumentPayload["company"];
  createdBy?: string;
  createdAt?: string;
};

export type PrintMapper = (params: Record<string, any>, ctx: PrintContext) => Promise<PrintableDocumentPayload>;

type DocConfig = {
  key: string;
  mapper: PrintMapper;
  roles?: string[];
  cache?: boolean;
};

export const docRegistry: DocConfig[] = [
  { key: "invoice.sales", mapper: mapSalesInvoice, roles: Roles.sales },
  { key: "invoice.purchase", mapper: mapPurchaseInvoice, roles: Roles.purchasing },
  { key: "voucher.cashReceipt", mapper: mapCashVoucher, roles: Roles.finance },
  { key: "voucher.cashPayment", mapper: mapCashVoucher, roles: Roles.finance },
  { key: "voucher.cashJournal", mapper: mapCashJournalVoucher, roles: Roles.finance },
  { key: "voucher.cashModuleReceipt", mapper: mapCashModuleReceipt, roles: Roles.finance },
  { key: "voucher.cashModulePayment", mapper: mapCashModulePayment, roles: Roles.finance },
  { key: "voucher.expense", mapper: mapExpenseVoucher, roles: Roles.finance },
  { key: "voucher.processing", mapper: mapProcessingVoucher, roles: Roles.ops },
  { key: "voucher.journal", mapper: mapJournalVoucher, roles: Roles.finance },
  { key: "report.stock", mapper: mapStockReport, roles: Roles.ops },
  { key: "report.purchases", mapper: mapPurchaseReport, roles: Roles.finance },
  { key: "report.sales", mapper: mapSalesReport, roles: Roles.finance },
  { key: "report.bardana", mapper: mapBardanaReport, roles: Roles.finance },
  { key: "report.less", mapper: mapLessReport, roles: Roles.finance },
  { key: "report.periodPurchases", mapper: mapPeriodPurchases, roles: Roles.finance },
  { key: "report.periodSales", mapper: mapPeriodSales, roles: Roles.finance },
  { key: "report.grossProfit", mapper: mapGrossProfit, roles: Roles.finance },
  { key: "report.dayBook", mapper: mapDayBook, roles: Roles.finance },
  { key: "report.outstandingCustomers", mapper: mapOutstandingCustomers, roles: Roles.finance },
  { key: "report.outstandingSuppliers", mapper: mapOutstandingSuppliers, roles: Roles.finance },
  { key: "report.ledger", mapper: mapLedgerReport, roles: Roles.finance, cache: true },
  { key: "report.trialBalance", mapper: mapTrialBalance, roles: Roles.finance, cache: true },
  { key: "statement.balanceSheet", mapper: mapBalanceSheet, roles: Roles.finance, cache: true },
  { key: "statement.incomeStatement", mapper: mapIncomeStatement, roles: Roles.finance },
  { key: "statement.profitLoss", mapper: mapProfitLoss, roles: Roles.finance },
  { key: "statement.capital", mapper: mapCapital, roles: Roles.finance },
  { key: "report.salary", mapper: mapSalary, roles: Roles.hr },
];

export function getDocConfig(docKey: string) {
  return docRegistry.find((d) => d.key === docKey);
}

