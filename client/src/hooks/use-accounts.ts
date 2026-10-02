import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "@/api/accounts.api";
import { apiKeys } from "@/api/keys";

export function useAccounts(params?: { type?: string; active?: boolean }) {
  return useQuery({
    queryKey: apiKeys.accounts(params),
    queryFn: () => accountsApi.list(params),
  });
}
