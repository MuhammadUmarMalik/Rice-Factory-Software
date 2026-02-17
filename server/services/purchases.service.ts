import { storage } from "../models/storage";

export async function getNextBillNumber() {
  return storage.getNextPurchaseBillNumber();
}

export async function listPurchases() {
  return storage.getPurchases();
}

export async function getPurchase(id: number) {
  return storage.getPurchaseWithDetails(id);
}

export async function createPurchase(data: any, items: any[], charges: any[], moundBaseKg: number) {
  return storage.createPurchase(data, items, charges, moundBaseKg);
}

export async function updatePurchase(id: number, data: any, items: any[], charges: any[], moundBaseKg: number) {
  return storage.updatePurchase(id, data, items, charges, moundBaseKg);
}

export async function deletePurchase(id: number, userId?: number, options?: { force?: boolean }) {
  return storage.deletePurchase(id, userId, options);
}
