import { createBaseStore, type RequestStatus } from "@/stores/base";

export type Receipt = {
  id: number;
  voucherNo?: string;
  voucherDate?: string;
  accountId?: number;
  amount: string;
  narration?: string;
  status?: "draft" | "approved";
};

export type ReceiptDraft = Partial<Receipt>;

const initial = {
  list: [] as Receipt[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as Receipt | null,
  draft: null as ReceiptDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useReceiptsStore = createBaseStore<Receipt, ReceiptDraft>(initial);
