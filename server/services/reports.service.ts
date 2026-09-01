import { storage } from "../models/storage";
import * as cashService from "./cash-in-hand.service";

export async function getStockReport(params: {
  fromDate?: Date;
  toDate?: Date;
  productId?: number;
  category?: string;
  unit?: string;
}) {
  return storage.getStockReport(params);
}

export async function getTrialBalance(asOfDate?: Date) {
  return storage.getTrialBalance(asOfDate);
}

export async function getProfitLoss(startDate?: Date, endDate?: Date) {
  return storage.getProfitLoss(startDate, endDate);
}

export async function getPurchaseReport(params: {
  fromDate?: Date;
  toDate?: Date;
  supplierId?: number;
  productId?: number;
  paymentStatus?: any;
}) {
  return storage.getPurchaseReport(params);
}

export async function getSalesReport(params: {
  fromDate?: Date;
  toDate?: Date;
  customerId?: number;
  productId?: number;
  paymentStatus?: any;
}) {
  return storage.getSalesReport(params);
}

export async function getPeriodPurchases(fromDate: Date, toDate: Date, supplierId?: number, groupBy?: any) {
  return storage.getPeriodPurchases(fromDate, toDate, supplierId, groupBy);
}

export async function getPeriodSales(fromDate: Date, toDate: Date, customerId?: number, groupBy?: any) {
  return storage.getPeriodSales(fromDate, toDate, customerId, groupBy);
}

export async function getGrossProfit(fromDate: Date, toDate: Date) {
  return storage.getGrossProfit(fromDate, toDate);
}

export async function getDayBook(date: Date) {
  return storage.getDayBook(date);
}

export async function getOutstandingCustomers(asOfDate: Date, customerId?: number) {
  return storage.getOutstandingCustomers(asOfDate, customerId);
}

export async function getOutstandingSuppliers(asOfDate: Date, supplierId?: number) {
  return storage.getOutstandingSuppliers(asOfDate, supplierId);
}

export async function getBardanaReport(params: {
  fromDate?: Date;
  toDate?: Date;
  supplierId?: number;
}) {
  return storage.getBardanaReport(params);
}

export async function getLessReport(params: {
  fromDate?: Date;
  toDate?: Date;
  supplierId?: number;
}) {
  return storage.getLessReport(params);
}

export async function getReportDetail(type: string, id: number) {
  const detail = await storage.getReportDetail(type, id);
  if (type.toLowerCase() === "sale" && detail?.sale) {
    const cashReceiptId = (detail.sale as { cashReceiptId?: number }).cashReceiptId;
    if (cashReceiptId) {
      (detail.sale as { cashReceiptVoucherNo?: string }).cashReceiptVoucherNo =
        await cashService.getCashReceiptVoucherNo(cashReceiptId);
    }
  }
  if (type.toLowerCase() === "purchase" && detail?.purchase) {
    const cashPaymentId = (detail.purchase as { cashPaymentId?: number }).cashPaymentId;
    if (cashPaymentId) {
      (detail.purchase as { cashPaymentVoucherNo?: string }).cashPaymentVoucherNo =
        await cashService.getCashPaymentVoucherNo(cashPaymentId);
    }
  }
  return detail;
}
