import { storage } from "../models/storage";

export async function listSales() {
  return storage.getSales();
}

export async function getSale(id: number) {
  const sale = await storage.getSale(id);
  if (!sale) return undefined;
  const items = await storage.getSaleItems(id);
  return { ...sale, items };
}

export async function createSale(data: any, items: any[]) {
  return storage.createSale(data, items);
}
