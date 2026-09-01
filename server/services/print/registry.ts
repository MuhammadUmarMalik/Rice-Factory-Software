import type { PrintableDocumentPayload } from "../../types/print";
import {
  mapBardanaReport,
  mapBalanceSheet,
  mapCapital,
  mapCashVoucher,
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
  { key: "invoice.sales", mapper: mapSalesInvoice },
  { key: "invoice.purchase", mapper: mapPurchaseInvoice },
  { key: "voucher.cashReceipt", mapper: mapCashVoucher },
  { key: "voucher.cashPayment", mapper: mapCashVoucher },
  { key: "voucher.journal", mapper: mapJournalVoucher },
  { key: "report.stock", mapper: mapStockReport },
  { key: "report.purchases", mapper: mapPurchaseReport },
  { key: "report.sales", mapper: mapSalesReport },
  { key: "report.bardana", mapper: mapBardanaReport },
  { key: "report.less", mapper: mapLessReport },
  { key: "report.periodPurchases", mapper: mapPeriodPurchases },
  { key: "report.periodSales", mapper: mapPeriodSales },
  { key: "report.grossProfit", mapper: mapGrossProfit },
  { key: "report.dayBook", mapper: mapDayBook },
  { key: "report.outstandingCustomers", mapper: mapOutstandingCustomers },
  { key: "report.outstandingSuppliers", mapper: mapOutstandingSuppliers },
  { key: "report.ledger", mapper: mapLedgerReport, cache: true },
  { key: "report.trialBalance", mapper: mapTrialBalance, cache: true },
  { key: "statement.balanceSheet", mapper: mapBalanceSheet, cache: true },
  { key: "statement.incomeStatement", mapper: mapIncomeStatement },
  { key: "statement.profitLoss", mapper: mapProfitLoss },
  { key: "statement.capital", mapper: mapCapital },
  { key: "report.salary", mapper: mapSalary },
];

export function getDocConfig(docKey: string) {
  return docRegistry.find((d) => d.key === docKey);
}

