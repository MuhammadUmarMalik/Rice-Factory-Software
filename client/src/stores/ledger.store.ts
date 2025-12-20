import { createBaseStore, type RequestStatus } from "@/stores/base";

export type LedgerRow = {
  id: number;
  date?: string;
  accountId?: number;
  narration?: string;
  debit?: string;
  credit?: string;
  balance?: string;
};

export type LedgerDraft = {
  accountId?: number | string;
  from?: string;
  to?: string;
};

const initial = {
  list: [] as LedgerRow[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 100, total: 0 },
  currentId: null as number | null,
  current: null as LedgerRow | null,
  draft: null as LedgerDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    export: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useLedgerStore = createBaseStore<LedgerRow, LedgerDraft>(initial);
