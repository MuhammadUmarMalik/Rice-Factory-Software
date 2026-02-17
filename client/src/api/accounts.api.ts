import { apiGet, apiPost, apiPatch, apiDelete } from "./base";
import type { Account } from "@shared/schema";

export const accountsApi = {
  list: (params?: { type?: string; active?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.type) search.set("type", params.type);
    if (params?.active !== undefined) search.set("active", String(params.active));
    const qs = search.toString();
    return apiGet<Account[]>(`/api/accounts${qs ? `?${qs}` : ""}`);
  },
  get: (id: number) => apiGet<Account>(`/api/accounts/${id}`),
  create: (data: { name: string; type: string; [key: string]: unknown }) =>
    apiPost<Account>("/api/accounts", data),
  update: (id: number, data: Partial<{ name: string; type: string; [key: string]: unknown }>) =>
    apiPatch<Account>(`/api/accounts/${id}`, data),
  delete: (id: number) => apiDelete(`/api/accounts/${id}`),
};
