import { useMutation, useQuery } from "@tanstack/react-query";
import { gatePassesApi, type GatePassListFilters } from "@/api/gate-passes.api";
import { apiKeys } from "@/api/keys";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";

/** Builds the query-string suffix used both for the request and the cache key. */
export function gatePassListQuery(filters?: GatePassListFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useGatePasses(filters?: GatePassListFilters, enabled = true) {
  const queryString = gatePassListQuery(filters);
  return useQuery({
    queryKey: apiKeys.gatePasses(queryString),
    queryFn: () => gatePassesApi.list(filters),
    enabled,
  });
}

export function useGatePass(id: number | null) {
  return useQuery({
    queryKey: apiKeys.gatePass(id ?? 0),
    queryFn: () => gatePassesApi.get(id as number),
    enabled: id != null && Number.isFinite(id),
  });
}

export function useGatePassDashboard(enabled = true) {
  return useQuery({
    queryKey: apiKeys.gatePassesDashboard,
    queryFn: gatePassesApi.dashboard,
    enabled,
  });
}

export function useSaleDispatchSummary(saleId: number | null) {
  return useQuery({
    queryKey: apiKeys.saleDispatchSummary(saleId ?? 0),
    queryFn: () => gatePassesApi.saleDispatchSummary(saleId as number),
    enabled: saleId != null && Number.isFinite(saleId),
  });
}

export function useCreateGatePass() {
  return useMutation({
    mutationKey: ["/api/gate-passes", "create"],
    meta: scopedInvalidation,
    mutationFn: (data: unknown) => gatePassesApi.create(data),
    onSuccess: () => invalidateApi(invalidationGroups.gatePasses),
  });
}

export function useCompleteGatePass() {
  return useMutation({
    mutationKey: ["/api/gate-passes", "complete"],
    meta: scopedInvalidation,
    mutationFn: (id: number) => gatePassesApi.complete(id),
    onSuccess: () => invalidateApi(invalidationGroups.gatePasses),
  });
}

export function useCancelGatePass() {
  return useMutation({
    mutationKey: ["/api/gate-passes", "cancel"],
    meta: scopedInvalidation,
    mutationFn: ({ id, reason }: { id: number; reason: string }) => gatePassesApi.cancel(id, reason),
    onSuccess: () => invalidateApi(invalidationGroups.gatePasses),
  });
}

/** Loads open IN passes (used by the purchase form's "Start from gate pass"). */
export function useOpenInPasses(enabled = true) {
  return useQuery({
    queryKey: apiKeys.gatePasses("?direction=IN&status=ISSUED"),
    queryFn: () => gatePassesApi.list({ direction: "IN", status: "ISSUED" }),
    enabled,
  });
}
