import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchasesApi } from "@/api/purchases.api";
import { apiKeys } from "@/api/keys";

export function usePurchases() {
  return useQuery({
    queryKey: ["/api/purchases"],
    queryFn: purchasesApi.list,
  });
}

export function usePurchase(id: number | null) {
  return useQuery({
    queryKey: id != null ? apiKeys.purchase(id) : ["/api/purchases", "none"],
    queryFn: () => (id != null ? purchasesApi.get(id) : Promise.reject("No id")),
    enabled: id != null,
  });
}

export function useNextBillNumber(enabled = true) {
  return useQuery({
    queryKey: apiKeys.purchasesNextBill,
    queryFn: purchasesApi.getNextBillNumber,
    enabled,
    refetchOnWindowFocus: false,
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purchasesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.purchases });
      qc.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      qc.invalidateQueries({ queryKey: apiKeys.products });
      qc.invalidateQueries({ queryKey: ["/api/cash/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/cash/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/cash/ledger"] });
    },
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) =>
      purchasesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.purchases });
      qc.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      qc.invalidateQueries({ queryKey: apiKeys.products });
      qc.invalidateQueries({ queryKey: ["/api/cash/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/cash/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/cash/ledger"] });
    },
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      purchasesApi.delete(id, force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.purchases });
      qc.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      qc.invalidateQueries({ queryKey: apiKeys.products });
    },
  });
}
