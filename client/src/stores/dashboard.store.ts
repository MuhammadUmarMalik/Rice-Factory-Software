import { createBaseStore, type RequestStatus } from "@/stores/base";

export type DashboardMetric = {
  key: string;
  label: string;
  value: number | string;
  delta?: number;
};

export type DashboardDraft = Partial<DashboardMetric>;

const initial = {
  list: [] as DashboardMetric[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 50, total: 0 },
  currentId: null as string | number | null,
  current: null as DashboardMetric | null,
  draft: null as DashboardDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    refresh: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useDashboardStore = createBaseStore<DashboardMetric, DashboardDraft>(initial);
