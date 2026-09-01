import { apiGet, apiPost, apiPatch, apiDelete } from "./base";
import { apiRequest } from "@/lib/queryClient";
import type { Purchase } from "@/types/schema";

export type PurchaseWithDetails = Purchase & { items: unknown[]; charges: unknown[] };

export const purchasesApi = {
  list: () => apiGet<Purchase[]>("/api/purchases"),
  get: (id: number) => apiGet<PurchaseWithDetails>(`/api/purchases/${id}`),
  getNextBillNumber: () =>
    apiRequest("GET", "/api/purchases/next-bill-number").then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch next bill number: ${r.status}`);
      return r.json() as Promise<{ billNo: string }>;
    }),
  create: (data: unknown) => apiPost<Purchase>("/api/purchases", data),
  update: (id: number, data: unknown) => apiPatch<Purchase>(`/api/purchases/${id}`, data),
  delete: (id: number, force = false) =>
    apiRequest("DELETE", `/api/purchases/${id}${force ? "?force=1" : ""}`),
};
