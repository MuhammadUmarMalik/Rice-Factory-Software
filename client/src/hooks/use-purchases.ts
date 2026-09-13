import { useQuery, useMutation } from "@tanstack/react-query";
import { purchasesApi } from "@/api/purchases.api";
import { apiKeys } from "@/api/keys";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";

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
  return useMutation({
    mutationKey: ["/api/purchases", "create"],
    meta: scopedInvalidation,
    mutationFn: purchasesApi.create,
    onSuccess: () => {
      invalidateApi(invalidationGroups.purchases);
    },
  });
}

export function useUpdatePurchase() {
  return useMutation({
    mutationKey: ["/api/purchases", "update"],
    meta: scopedInvalidation,
    mutationFn: ({ id, data }: { id: number; data: unknown }) =>
      purchasesApi.update(id, data),
    onSuccess: () => {
      invalidateApi(invalidationGroups.purchases);
    },
  });
}

export function useDeletePurchase() {
  return useMutation({
    mutationKey: ["/api/purchases", "delete"],
    meta: scopedInvalidation,
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      purchasesApi.delete(id, force),
    onSuccess: () => {
      // Deleting also releases the stock and supplier balance the purchase took,
      // so it invalidates the same group a create does.
      invalidateApi(invalidationGroups.purchases);
    },
  });
}
