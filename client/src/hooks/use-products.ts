import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/api/products.api";
import { apiKeys } from "@/api/keys";

export function useProducts() {
  return useQuery({
    queryKey: apiKeys.products,
    queryFn: productsApi.list,
  });
}
