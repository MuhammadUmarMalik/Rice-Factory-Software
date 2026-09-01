import { createBaseStore, type RequestStatus } from "@/stores/base";

export type Expense = {
  id: number;
  expenseDate?: string;
  accountId?: number;
  amount: string;
  description?: string;
  status?: "draft" | "approved";
};

export type ExpenseDraft = Partial<Expense>;

const initial = {
  list: [] as Expense[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as Expense | null,
  draft: null as ExpenseDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useExpensesStore = createBaseStore<Expense, ExpenseDraft>(initial);
