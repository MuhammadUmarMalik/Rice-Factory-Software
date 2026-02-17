import { container } from "../container";

const repo = container.sales;
const storage = container.storage;

export async function listSales() {
  return repo.getSales();
}

export async function getSale(id: number) {
  const sale = await repo.getSale(id);
  if (!sale) return undefined;
  const items = await storage.getSaleItems(id);
  return { ...sale, items };
}

export async function createSale(
  data: Parameters<typeof repo.createSale>[0],
  items: Parameters<typeof repo.createSale>[1]
) {
  return repo.createSale(data, items);
}

export async function updateSale(
  id: number,
  data: Parameters<typeof repo.updateSale>[1],
  items: Parameters<typeof repo.updateSale>[2]
) {
  return repo.updateSale(id, data, items);
}

export async function deleteSale(id: number) {
  return repo.deleteSale(id);
}
