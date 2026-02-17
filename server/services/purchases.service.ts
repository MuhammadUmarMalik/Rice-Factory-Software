import { container } from "../container";

const repo = container.purchases;

export async function getNextBillNumber() {
  return repo.getNextPurchaseBillNumber();
}

export async function listPurchases() {
  return repo.getPurchases();
}

export async function getPurchase(id: number) {
  return repo.getPurchaseWithDetails(id);
}

export async function createPurchase(
  data: Parameters<typeof repo.createPurchase>[0],
  items: Parameters<typeof repo.createPurchase>[1],
  charges: Parameters<typeof repo.createPurchase>[2],
  moundBaseKg: number
) {
  return repo.createPurchase(data, items, charges, moundBaseKg);
}

export async function updatePurchase(
  id: number,
  data: Parameters<typeof repo.updatePurchase>[1],
  items: Parameters<typeof repo.updatePurchase>[2],
  charges: Parameters<typeof repo.updatePurchase>[3],
  moundBaseKg: number
) {
  return repo.updatePurchase(id, data, items, charges, moundBaseKg);
}

export async function deletePurchase(id: number, userId?: number, options?: { force?: boolean }) {
  return repo.deletePurchase(id, userId, options);
}
