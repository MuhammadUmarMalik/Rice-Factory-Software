import { storage } from "../models/storage";

export async function listPayments() {
  const [vouchers, accountsList] = await Promise.all([
    storage.getReceiptVouchers(),
    storage.getAccounts(),
  ]);
  const accountMap = new Map(accountsList.map((a) => [a.id, a.name]));

  const detailed = await Promise.all(
    vouchers
      .filter((v) => v.voucherType === "CP")
      .map(async (v) => {
        const withLines = await storage.getReceiptVoucher(v.id);
        const lines = withLines?.lines || [];
        const primaryAccountName = lines.length > 0 ? accountMap.get(lines[0].accountId) || "" : "";
        return { ...v, lines, primaryAccountName };
      })
  );

  return detailed;
}

export async function getNextPaymentNumber() {
  return storage.getNextReceiptVoucherNumber("CP");
}

export async function getPayment(id: number) {
  return storage.getReceiptVoucher(id);
}

export async function createPayment(header: any, lines: any[]) {
  return storage.createReceiptVoucher(header, lines);
}

export async function updatePayment(id: number, header: any, lines: any[]) {
  return storage.updateReceiptVoucher(id, header, lines);
}

export async function deletePayment(id: number) {
  return storage.deleteReceiptVoucher(id);
}
