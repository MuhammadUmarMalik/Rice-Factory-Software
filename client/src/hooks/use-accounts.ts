import { useQuery, useMutation } from "@tanstack/react-query";
import { accountsApi } from "@/api/accounts.api";
import { apiKeys } from "@/api/keys";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";

export function useAccounts(params?: { type?: string; active?: boolean }) {
  return useQuery({
    queryKey: apiKeys.accounts(params),
    queryFn: () => accountsApi.list(params),
  });
}

export function useAccount(id: number | null) {
  return useQuery({
    queryKey: id != null ? apiKeys.account(id) : ["/api/accounts", "none"],
    queryFn: () => (id != null ? accountsApi.get(id) : Promise.reject("No id")),
    enabled: id != null,
  });
}

export function useCreateAccount() {
  return useMutation({
    mutationKey: ["/api/accounts", "create"],
    meta: scopedInvalidation,
    mutationFn: accountsApi.create,
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
    },
  });
}

export function useUpdateAccount() {
  return useMutation({
    mutationKey: ["/api/accounts", "update"],
    meta: scopedInvalidation,
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof accountsApi.update>[1] }) =>
      accountsApi.update(id, data),
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationKey: ["/api/accounts", "delete"],
    meta: scopedInvalidation,
    mutationFn: accountsApi.delete,
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
    },
  });
}
