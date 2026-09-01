import { apiGet, apiPost, apiPatch, apiDelete } from "./base";
import type { ExpenseEntry } from "@/types/schema";

export const expensesApi = {
  list: () => apiGet<ExpenseEntry[]>("/api/expenses"),
  create: (data: unknown) => apiPost<ExpenseEntry>("/api/expenses", data),
  update: (id: number, data: unknown) => apiPatch<ExpenseEntry>(`/api/expenses/${id}`, data),
  delete: (id: number) => apiDelete(`/api/expenses/${id}`),
};
