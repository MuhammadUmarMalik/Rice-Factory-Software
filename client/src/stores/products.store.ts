import type { Product } from "@/types/schema";
import { createBaseStore, type RequestStatus } from "@/stores/base";

export type ProductDraft = Partial<Product>;

const initial = {
  list: [] as Product[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as Product | null,
  draft: null as ProductDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useProductStore = createBaseStore<Product, ProductDraft>(initial);
