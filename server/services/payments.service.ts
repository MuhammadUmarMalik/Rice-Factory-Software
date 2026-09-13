import * as ledgerModel from "../models/ledger.model";
import { insertVoucherAuditLog } from "./voucher-audit.service";

export async function listPayments() {
  // One join instead of a query per voucher; the type filter runs in SQL too.
  return ledgerModel.getReceiptVouchersWithLines("CP");
}

export async function getNextPaymentNumber() {
  return ledgerModel.getNextReceiptVoucherNumber("CP");
}

export async function getPayment(id: number) {
  return ledgerModel.getReceiptVoucher(id);
}

export async function createPayment(header: any, lines: any[], userId?: number) {
  const voucher = await ledgerModel.createReceiptVoucher(header, lines);
  // Payments move money; record who created what, same as every daybook write.
  const after = await ledgerModel.getReceiptVoucher(voucher.id);
  insertVoucherAuditLog("CP", voucher.id, "create", null, after ?? voucher, userId);
  return voucher;
}

export async function updatePayment(id: number, header: any, lines: any[], userId?: number) {
  // Snapshot before the write; storage mutates the voucher and its lines in place.
  const before = await ledgerModel.getReceiptVoucher(id);
  const voucher = await ledgerModel.updateReceiptVoucher(id, header, lines);
  if (!voucher) return voucher;
  const after = await ledgerModel.getReceiptVoucher(id);
  insertVoucherAuditLog("CP", id, "update", before, after ?? voucher, userId);
  return voucher;
}

export async function deletePayment(id: number, userId?: number) {
  // The row is soft-deleted, but capture it first so the audit row keeps the
  // full voucher (header + lines) regardless of how storage removes it.
  const before = await ledgerModel.getReceiptVoucher(id);
  const ok = await ledgerModel.deleteReceiptVoucher(id);
  if (ok) insertVoucherAuditLog("CP", id, "delete", before, null, userId);
  return ok;
}
