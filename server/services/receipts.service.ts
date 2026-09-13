import * as ledgerModel from "../models/ledger.model";
import { insertVoucherAuditLog } from "./voucher-audit.service";

export async function listReceipts() {
  // One join instead of a query per voucher; the type filter runs in SQL too.
  return ledgerModel.getReceiptVouchersWithLines("CR");
}

export async function getNextReceiptNumber(type: "CR" | "CP" | "BR" | "BP") {
  return ledgerModel.getNextReceiptVoucherNumber(type);
}

export async function getReceipt(id: number) {
  return ledgerModel.getReceiptVoucher(id);
}

export async function createReceipt(header: any, lines: any[], userId?: number) {
  const voucher = await ledgerModel.createReceiptVoucher(header, lines);
  // Receipts move money; record who created what, same as every daybook write.
  const after = await ledgerModel.getReceiptVoucher(voucher.id);
  insertVoucherAuditLog("CR", voucher.id, "create", null, after ?? voucher, userId);
  return voucher;
}

export async function updateReceipt(id: number, header: any, lines: any[], userId?: number) {
  // Snapshot before the write; storage mutates the voucher and its lines in place.
  const before = await ledgerModel.getReceiptVoucher(id);
  const voucher = await ledgerModel.updateReceiptVoucher(id, header, lines);
  if (!voucher) return voucher;
  const after = await ledgerModel.getReceiptVoucher(id);
  insertVoucherAuditLog("CR", id, "update", before, after ?? voucher, userId);
  return voucher;
}

export async function deleteReceipt(id: number, userId?: number) {
  // The row is soft-deleted, but capture it first so the audit row keeps the
  // full voucher (header + lines) regardless of how storage removes it.
  const before = await ledgerModel.getReceiptVoucher(id);
  const ok = await ledgerModel.deleteReceiptVoucher(id);
  if (ok) insertVoucherAuditLog("CR", id, "delete", before, null, userId);
  return ok;
}
