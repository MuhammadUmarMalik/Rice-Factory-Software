import { createBaseStore, type RequestStatus } from "@/stores/base";

export type ProcessingBatch = {
  id: number;
  inputProductId?: number;
  outputProductId?: number;
  inputQty?: string;
  outputQty?: string;
  wastageQty?: string;
  notes?: string;
  date?: string;
};

export type ProcessingDraft = Partial<ProcessingBatch>;

const initial = {
  list: [] as ProcessingBatch[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as ProcessingBatch | null,
  draft: null as ProcessingDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useProcessingStore = createBaseStore<ProcessingBatch, ProcessingDraft>(initial);
