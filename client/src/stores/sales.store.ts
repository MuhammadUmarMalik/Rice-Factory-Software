import { createBaseStore, type RequestStatus } from "@/stores/base";

export type Sale = {
  id: number;
  invoiceNumber?: string;
  date?: string;
  customerId?: number;
  totalAmount?: string;
  paidAmount?: string;
  status?: "draft" | "submitted" | "paid";
  items?: any[];
};

export type SaleDraft = Partial<Sale>;

const initial = {
  list: [] as Sale[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as Sale | null,
  draft: null as SaleDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useSalesStore = createBaseStore<Sale, SaleDraft>(initial);
