import { useQuery, useMutation } from "@tanstack/react-query";
import { salesApi } from "@/api/sales.api";
import { apiKeys } from "@/api/keys";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";

export function useSales() {
  return useQuery({
    queryKey: apiKeys.sales,
    queryFn: salesApi.list,
  });
}

export function useSale(id: number | null) {
  return useQuery({
    queryKey: id != null ? apiKeys.sale(id) : ["/api/sales", "none"],
    queryFn: () => (id != null ? salesApi.get(id) : Promise.reject("No id")),
    enabled: id != null,
  });
}

export function useCreateSale() {
  return useMutation({
    mutationKey: ["/api/sales", "create"],
    meta: scopedInvalidation,
    mutationFn: salesApi.create,
    onSuccess: () => {
      invalidateApi(invalidationGroups.sales);
    },
  });
}

export function useUpdateSale() {
  return useMutation({
    mutationKey: ["/api/sales", "update"],
    meta: scopedInvalidation,
    mutationFn: ({ id, data }: { id: number; data: unknown }) =>
      salesApi.update(id, data),
    onSuccess: () => {
      invalidateApi(invalidationGroups.sales);
    },
  });
}

export function useDeleteSale() {
  return useMutation({
    mutationKey: ["/api/sales", "delete"],
    meta: scopedInvalidation,
    mutationFn: salesApi.delete,
    onSuccess: () => {
      invalidateApi(invalidationGroups.sales);
    },
  });
}
