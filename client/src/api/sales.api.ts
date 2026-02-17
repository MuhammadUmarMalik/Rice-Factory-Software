import { apiGet, apiPost, apiPatch, apiDelete } from "./base";
import type { Sale } from "@/types/schema";

export const salesApi = {
  list: () => apiGet<Sale[]>("/api/sales"),
  get: (id: number) => apiGet<Sale>(`/api/sales/${id}`),
  create: (data: unknown) => apiPost<Sale>("/api/sales", data),
  update: (id: number, data: unknown) => apiPatch<Sale>(`/api/sales/${id}`, data),
  delete: (id: number) => apiDelete(`/api/sales/${id}`),
};
