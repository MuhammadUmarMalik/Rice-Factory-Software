import { storage } from "../models/storage";

export async function listProducts() {
  return storage.getProducts();
}

export async function getProduct(id: number) {
  return storage.getProduct(id);
}

export async function createProduct(data: any) {
  return storage.createProduct(data);
}

export async function updateProduct(id: number, data: any) {
  return storage.updateProduct(id, data);
}

export async function deleteProduct(id: number) {
  return storage.deleteProduct(id);
}
