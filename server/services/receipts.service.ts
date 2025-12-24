import { storage } from "../models/storage";

export async function listReceipts() {
  const [vouchers, accountsList] = await Promise.all([
    storage.getReceiptVouchers(),
    storage.getAccounts(),
  ]);
  const accountMap = new Map(accountsList.map((a) => [a.id, a.name]));

  const detailed = await Promise.all(
    vouchers
      .filter((v) => v.voucherType === "CR")
      .map(async (v) => {
        const withLines = await storage.getReceiptVoucher(v.id);
        const lines = withLines?.lines || [];
        const primaryAccountName = lines.length > 0 ? accountMap.get(lines[0].accountId) || "" : "";
        return { ...v, lines, primaryAccountName };
      })
  );

  return detailed;
}

export async function getNextReceiptNumber(type: string) {
  return storage.getNextReceiptVoucherNumber(type);
}

export async function getReceipt(id: number) {
  return storage.getReceiptVoucher(id);
}

export async function createReceipt(header: any, lines: any[]) {
  return storage.createReceiptVoucher(header, lines);
}

export async function updateReceipt(id: number, header: any, lines: any[]) {
  return storage.updateReceiptVoucher(id, header, lines);
}

export async function deleteReceipt(id: number) {
  return storage.deleteReceiptVoucher(id);
}
