import { createBaseStore, type RequestStatus } from "@/stores/base";

export type StockItem = {
  id: number | string;
  productId: number | string;
  locationId?: number | string;
  qty: string;
  unit?: string;
  updatedAt?: string;
};

export type StockFilter = {
  productId?: number | string;
  locationId?: number | string;
};

export type StockDraft = Partial<StockFilter>;

const initial = {
  list: [] as StockItem[],
  filters: {} as StockFilter,
  sort: null,
  pagination: { page: 1, pageSize: 50, total: 0 },
  currentId: null as number | string | null,
  current: null as StockItem | null,
  draft: null as StockDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    export: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useStockStore = createBaseStore<StockItem, StockDraft>(initial);
