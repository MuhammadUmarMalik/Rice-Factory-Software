import { container } from "../container";
import * as productsModel from "../models/products.model";

const repo = container.products;

// stockLocked tells the edit dialog whether the opening figures can still change.
export async function listProducts() {
  const locked = productsModel.getStockLockedProductIds();
  return (await repo.getActiveProducts()).map((p) => ({ ...p, stockLocked: locked.has(p.id) }));
}

export async function getProduct(id: number) {
  const product = await repo.getProduct(id);
  return product && { ...product, stockLocked: productsModel.getStockLockedProductIds().has(id) };
}

export async function createProduct(data: Parameters<typeof repo.createProduct>[0]) {
  return repo.createProduct(data);
}

export async function updateProduct(
  id: number,
  data: Parameters<typeof repo.updateProduct>[1],
  opening: { currentStock?: string; avgPurchasePrice?: string } = {},
) {
  const product = productsModel.updateProductWithOpening(id, data, opening);
  return product && { ...product, stockLocked: productsModel.getStockLockedProductIds().has(id) };
}

export async function deleteProduct(id: number) {
  return repo.deleteProduct(id);
}
