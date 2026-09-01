import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "@/api/sales.api";
import { apiKeys } from "@/api/keys";

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.sales });
      qc.invalidateQueries({ queryKey: ["/api/reports/sales"] });
      qc.invalidateQueries({ queryKey: apiKeys.products });
    },
  });
}

export function useUpdateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) =>
      salesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.sales });
      qc.invalidateQueries({ queryKey: ["/api/reports/sales"] });
      qc.invalidateQueries({ queryKey: apiKeys.products });
    },
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salesApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.sales });
      qc.invalidateQueries({ queryKey: ["/api/reports/sales"] });
      qc.invalidateQueries({ queryKey: apiKeys.products });
    },
  });
}
