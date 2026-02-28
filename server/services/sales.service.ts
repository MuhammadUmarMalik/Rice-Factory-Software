import { container } from "../container";
import * as cashService from "./cash-in-hand.service";

const repo = container.sales;
const storage = container.storage;

export async function listSales() {
  const sales = await repo.getSales();
  const receiptIds = sales.map((s) => (s as any).cashReceiptId).filter(Boolean) as number[];
  const voucherNos = cashService.getCashReceiptVoucherNos(receiptIds);
  return sales.map((s) => {
    const id = (s as any).cashReceiptId;
    return { ...s, cashReceiptVoucherNo: id ? voucherNos.get(id) ?? null : null };
  });
}

export async function getSale(id: number) {
  const sale = await repo.getSale(id);
  if (!sale) return undefined;
  const items = await storage.getSaleItems(id);
  const cashReceiptId = (sale as any).cashReceiptId;
  const cashReceiptVoucherNo = cashReceiptId ? await cashService.getCashReceiptVoucherNo(cashReceiptId) : null;
  return { ...sale, items, cashReceiptVoucherNo: cashReceiptVoucherNo ?? undefined };
}

export async function createSale(
  data: Parameters<typeof repo.createSale>[0],
  items: Parameters<typeof repo.createSale>[1]
) {
  const sale = await repo.createSale(data, items);
  const paymentMode = (data as any).paymentMode ?? "cash";
  const paidAmount = parseFloat((data as any).paidAmount || "0");
  if (paymentMode === "cash" && paidAmount > 0) {
    try {
      const customer = await storage.getAccount(sale.customerId);
      const receiptDate = sale.saleDate instanceof Date ? sale.saleDate.toISOString().slice(0, 10) : new Date((sale.saleDate as number) || Date.now()).toISOString().slice(0, 10);
      await cashService.createReceiptForSale({
        saleId: sale.id,
        paidAmount,
        receivedFrom: customer?.name ?? "Customer",
        receiptDate,
        invoiceNumber: sale.invoiceNumber,
      });
    } catch (err) {
      console.error("Cash receipt auto-link failed:", err);
    }
  }
  return sale;
}

export async function updateSale(
  id: number,
  data: Parameters<typeof repo.updateSale>[1],
  items: Parameters<typeof repo.updateSale>[2]
) {
  const existing = await repo.getSale(id);
  const sale = await repo.updateSale(id, data, items);
  if (!sale) return sale;
  const paymentMode = (data as any).paymentMode ?? (existing as any)?.paymentMode ?? "cash";
  const paidAmount = parseFloat((data as any).paidAmount ?? sale.paidAmount ?? "0");
  if (paymentMode === "cash" && paidAmount > 0) {
    try {
      const customer = await storage.getAccount(sale.customerId);
      const receiptDate = sale.saleDate instanceof Date ? sale.saleDate.toISOString().slice(0, 10) : new Date((sale.saleDate as number) || Date.now()).toISOString().slice(0, 10);
      await cashService.updateOrCreateReceiptForSale({
        saleId: sale.id,
        paidAmount,
        receivedFrom: customer?.name ?? "Customer",
        receiptDate,
        invoiceNumber: sale.invoiceNumber,
        existingCashReceiptId: (existing as any)?.cashReceiptId ?? sale.cashReceiptId,
      });
    } catch (err) {
      console.error("Cash receipt sync on sale update failed:", err);
    }
  } else if ((existing as any)?.cashReceiptId || (sale as any)?.cashReceiptId) {
    try {
      await cashService.unlinkReceiptForSale({
        saleId: sale.id,
        existingCashReceiptId: (existing as any)?.cashReceiptId ?? (sale as any)?.cashReceiptId ?? null,
      });
    } catch (err) {
      console.error("Cash receipt unlink on sale update failed:", err);
    }
  }
  return (await getSale(id)) ?? sale;
}

export async function deleteSale(id: number) {
  return repo.deleteSale(id);
}
