import { apiGet, apiPost, apiPatch, apiDelete } from "./base";
import type { Product } from "@shared/schema";

export const productsApi = {
  list: () => apiGet<Product[]>("/api/products"),
  get: (id: number) => apiGet<Product>(`/api/products/${id}`),
  create: (data: { name: string; unit: string; [key: string]: unknown }) =>
    apiPost<Product>("/api/products", data),
  update: (id: number, data: Partial<{ name: string; unit: string; [key: string]: unknown }>) =>
    apiPatch<Product>(`/api/products/${id}`, data),
  delete: (id: number) => apiDelete(`/api/products/${id}`),
};
