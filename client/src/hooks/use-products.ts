import { useQuery, useMutation } from "@tanstack/react-query";
import { productsApi } from "@/api/products.api";
import { apiKeys } from "@/api/keys";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";

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
  return useMutation({
    mutationKey: ["/api/products", "create"],
    meta: scopedInvalidation,
    mutationFn: productsApi.create,
    onSuccess: () => {
      invalidateApi(invalidationGroups.products);
    },
  });
}

export function useUpdateProduct() {
  return useMutation({
    mutationKey: ["/api/products", "update"],
    meta: scopedInvalidation,
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof productsApi.update>[1] }) =>
      productsApi.update(id, data),
    onSuccess: () => {
      invalidateApi(invalidationGroups.products);
    },
  });
}

export function useDeleteProduct() {
  return useMutation({
    mutationKey: ["/api/products", "delete"],
    meta: scopedInvalidation,
    mutationFn: productsApi.delete,
    onSuccess: () => {
      invalidateApi(invalidationGroups.products);
    },
  });
}
