import { container } from "../container";

const repo = container.products;

export async function listProducts() {
  return repo.getActiveProducts();
}

export async function getProduct(id: number) {
  return repo.getProduct(id);
}

export async function createProduct(data: Parameters<typeof repo.createProduct>[0]) {
  return repo.createProduct(data);
}

export async function updateProduct(id: number, data: Parameters<typeof repo.updateProduct>[1]) {
  return repo.updateProduct(id, data);
}

export async function deleteProduct(id: number) {
  return repo.deleteProduct(id);
}
