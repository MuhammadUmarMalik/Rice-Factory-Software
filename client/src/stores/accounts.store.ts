import { createBaseStore, type RequestStatus } from "@/stores/base";

export type AccountEntity = {
  id: number;
  name: string;
  type: "customer" | "supplier" | "bank" | "expense" | "other";
  balance?: string;
  meta?: Record<string, unknown>;
};

export type AccountDraft = Partial<AccountEntity>;

const initial = {
  list: [] as AccountEntity[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as AccountEntity | null,
  draft: null as AccountDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useAccountsStore = createBaseStore<AccountEntity, AccountDraft>(initial);
