import { apiGet, apiPost } from "./base";
import type {
  GatePass,
  GatePassDashboard,
  GatePassListRow,
  SaleDispatchSummary,
} from "@/types/schema";

export type GatePassListFilters = {
  from?: string;
  to?: string;
  direction?: "IN" | "OUT";
  status?: "ISSUED" | "COMPLETED" | "CANCELLED";
  partyId?: number;
  vehicleNo?: string;
};

function listQuery(filters?: GatePassListFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const gatePassesApi = {
  list: (filters?: GatePassListFilters) =>
    apiGet<GatePassListRow[]>(`/api/gate-passes${listQuery(filters)}`),
  get: (id: number) => apiGet<GatePass>(`/api/gate-passes/${id}`),
  dashboard: () => apiGet<GatePassDashboard>("/api/gate-passes/dashboard"),
  create: (data: unknown) => apiPost<GatePass>("/api/gate-passes", data),
  complete: (id: number) => apiPost<GatePass>(`/api/gate-passes/${id}/complete`),
  cancel: (id: number, reason: string) =>
    apiPost<GatePass>(`/api/gate-passes/${id}/cancel`, { reason }),
  saleDispatchSummary: (saleId: number) =>
    apiGet<SaleDispatchSummary>(`/api/sales/${saleId}/dispatch-summary`),
};
