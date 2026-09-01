import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "@/api/products.api";
import { apiKeys } from "@/api/keys";

export function useProducts() {
  return useQuery({
    queryKey: apiKeys.products,
    queryFn: productsApi.list,
  });
}

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: id != null ? apiKeys.product(id) : ["/api/products", "none"],
    queryFn: () => (id != null ? productsApi.get(id) : Promise.reject("No id")),
    enabled: id != null,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.products });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof productsApi.update>[1] }) =>
      productsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.products });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiKeys.products });
    },
  });
}
