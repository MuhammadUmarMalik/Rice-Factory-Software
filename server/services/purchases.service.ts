import { container } from "../container";
import * as accountsModel from "../models/accounts.model";
import * as gatePassesModel from "../models/gate-passes.model";
import * as cashService from "./cash-in-hand.service";

const repo = container.purchases;

export async function getNextBillNumber() {
  return repo.getNextPurchaseBillNumber();
}

export async function listPurchases() {
  const purchasesList = await repo.getPurchases();
  const paymentIds = purchasesList.map((p) => (p as { cashPaymentId?: number }).cashPaymentId).filter(Boolean) as number[];
  const voucherNos = paymentIds.length ? cashService.getCashPaymentVoucherNos(paymentIds) : new Map<number, string>();
  // One query for every row's linked gate passes, then attach them so the list
  // can show the pass number next to each purchase without N+1 lookups.
  const passMap = await gatePassesModel.getGatePassRefsForSources(
    "PURCHASE",
    purchasesList.map((p) => p.id),
  );
  return purchasesList.map((p) => {
    const id = (p as { cashPaymentId?: number }).cashPaymentId;
    return {
      ...p,
      cashPaymentVoucherNo: id ? voucherNos.get(id) ?? null : null,
      gatePasses: passMap.get(p.id) ?? [],
    };
  });
}

export async function getPurchase(id: number) {
  const purchase = await repo.getPurchaseWithDetails(id);
  if (!purchase) return undefined;
  const cashPaymentId = (purchase as { cashPaymentId?: number }).cashPaymentId;
  const cashPaymentVoucherNo = cashPaymentId ? await cashService.getCashPaymentVoucherNo(cashPaymentId) : null;
  const passMap = await gatePassesModel.getGatePassRefsForSources("PURCHASE", [id]);
  return { ...purchase, cashPaymentVoucherNo: cashPaymentVoucherNo ?? undefined, gatePasses: passMap.get(id) ?? [] };
}

export async function createPurchase(
  data: Parameters<typeof repo.createPurchase>[0],
  items: Parameters<typeof repo.createPurchase>[1],
  charges: Parameters<typeof repo.createPurchase>[2],
  moundBaseKg: number,
  options: Parameters<typeof repo.createPurchase>[4] = {}
) {
  const result = await repo.createPurchase(data, items, charges, moundBaseKg, options);
  const paymentMode = (data as any).paymentMode ?? "cash";
  const paidAmount = parseFloat((data as any).paidAmount || (result as any).paidAmount || "0");
  if (paymentMode === "cash" && paidAmount > 0) {
    try {
      const supplier = await accountsModel.getAccount(result.supplierId);
      const paymentDate = result.purchaseDate instanceof Date ? result.purchaseDate.toISOString().slice(0, 10) : new Date((result.purchaseDate as number) || Date.now()).toISOString().slice(0, 10);
      await cashService.createPaymentForPurchase({
        purchaseId: result.id,
        paidAmount,
        paidTo: supplier?.name ?? "Supplier",
        paymentDate,
        invoiceNumber: result.invoiceNumber,
      });
    } catch (err) {
      console.error("Cash payment auto-link failed:", err);
    }
  }
  return result;
}

export async function updatePurchase(
  id: number,
  data: Parameters<typeof repo.updatePurchase>[1],
  items: Parameters<typeof repo.updatePurchase>[2],
  charges: Parameters<typeof repo.updatePurchase>[3],
  moundBaseKg: number
) {
  const existing = await repo.getPurchaseWithDetails(id);
  if (!existing) return undefined;
  const result = await repo.updatePurchase(id, data, items, charges, moundBaseKg);
  if (!result) return undefined;
  const paymentMode = (data as { paymentMode?: string })?.paymentMode ?? (existing as { paymentMode?: string })?.paymentMode ?? "cash";
  const paidAmount = parseFloat((data as { paidAmount?: string })?.paidAmount ?? (result as { paidAmount?: string })?.paidAmount ?? "0");
  if (paymentMode === "cash" && paidAmount > 0) {
    try {
      const supplier = await accountsModel.getAccount(result.supplierId);
      const paymentDate = result.purchaseDate instanceof Date ? result.purchaseDate : (result.purchaseDate as number);
      const dateStr = typeof paymentDate === "number" ? new Date(paymentDate).toISOString().slice(0, 10) : new Date(paymentDate).toISOString().slice(0, 10);
      await cashService.updateOrCreatePaymentForPurchase({
        purchaseId: id,
        paidAmount,
        paidTo: supplier?.name ?? "Supplier",
        paymentDate: dateStr,
        invoiceNumber: result.invoiceNumber ?? String(id),
        existingCashPaymentId: (existing as { cashPaymentId?: number })?.cashPaymentId ?? (result as { cashPaymentId?: number })?.cashPaymentId,
      });
    } catch (err) {
      console.error("Cash payment sync on purchase update failed:", err);
    }
  }
  return (await getPurchase(id)) ?? result;
}

export async function deletePurchase(id: number, userId?: number, options?: { force?: boolean }) {
  return repo.deletePurchase(id, userId, options);
}
