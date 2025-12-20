import { createBaseStore, type RequestStatus } from "@/stores/base";

export type ReportFilter = {
  from?: string;
  to?: string;
  accountId?: number | string;
  productId?: number | string;
  customerId?: number | string;
  supplierId?: number | string;
  type?: string;
};

export type ReportRow = Record<string, unknown>;

export type ReportDraft = ReportFilter;

const initial = {
  list: [] as ReportRow[],
  filters: {} as ReportFilter,
  sort: null,
  pagination: { page: 1, pageSize: 50, total: 0 },
  currentId: null as number | string | null,
  current: null as ReportRow | null,
  draft: null as ReportDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    export: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useReportsStore = createBaseStore<ReportRow, ReportDraft>(initial);
