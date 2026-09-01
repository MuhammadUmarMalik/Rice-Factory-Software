import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountsApi } from "@/api/accounts.api";
import { apiKeys } from "@/api/keys";

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounts"] });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof accountsApi.update>[1] }) =>
      accountsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounts"] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounts"] });
    },
  });
}
