import { createBaseStore, type RequestStatus } from "@/stores/base";

export type Payment = {
  id: number;
  voucherNo?: string;
  voucherDate?: string;
  accountId?: number;
  amount: string;
  narration?: string;
  status?: "draft" | "approved";
};

export type PaymentDraft = Partial<Payment>;

const initial = {
  list: [] as Payment[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as Payment | null,
  draft: null as PaymentDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const usePaymentsStore = createBaseStore<Payment, PaymentDraft>(initial);
