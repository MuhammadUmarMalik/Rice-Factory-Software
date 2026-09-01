import { createBaseStore, type RequestStatus } from "@/stores/base";

export type CashSnapshot = {
  id: number;
  date?: string;
  opening?: string;
  inflow?: string;
  outflow?: string;
  closing?: string;
};

export type CashDraft = Partial<CashSnapshot>;

const initial = {
  list: [] as CashSnapshot[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as CashSnapshot | null,
  draft: null as CashDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useCashStore = createBaseStore<CashSnapshot, CashDraft>(initial);
