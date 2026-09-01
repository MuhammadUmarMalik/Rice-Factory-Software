import { createBaseStore, type RequestStatus } from "@/stores/base";

export type JournalEntry = {
  id: number;
  voucherNo?: string;
  voucherDate?: string;
  debitAccountId?: number;
  creditAccountId?: number;
  amount: string;
  narration?: string;
  status?: "draft" | "approved";
};

export type JournalDraft = Partial<JournalEntry>;

const initial = {
  list: [] as JournalEntry[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as JournalEntry | null,
  draft: null as JournalDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useJournalStore = createBaseStore<JournalEntry, JournalDraft>(initial);
