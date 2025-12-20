import { create } from "zustand";

export type RequestStatus = "idle" | "loading" | "success" | "error";

export type SortState = { field: string; dir: "asc" | "desc" } | null;

export type PaginationState = { page: number; pageSize: number; total: number };

export type ViewMode = "view" | "edit" | "create" | null;

export type BaseState<T, Draft> = {
  list: T[];
  filters: Record<string, unknown>;
  sort: SortState;
  pagination: PaginationState;
  currentId: number | string | null;
  current: T | null;
  draft: Draft | null;
  mode: ViewMode;
  request: Record<string, RequestStatus>;
  error?: string;
};

export type BaseActions<T, Draft> = {
  setList: (list: T[]) => void;
  setFilters: (filters: Record<string, unknown>) => void;
  setSort: (sort: SortState) => void;
  setPage: (page: number) => void;
  setCurrentId: (id: number | string | null) => void;
  setCurrent: (item: T | null) => void;
  startDraft: (from?: T | null, fallback?: Draft) => void;
  updateDraft: (patch: Partial<Draft>) => void;
  setMode: (mode: ViewMode) => void;
  setRequest: (key: string, status: RequestStatus) => void;
  setError: (err?: string) => void;
  reset: () => void;
};

export const createBaseStore = <T, Draft>(
  initial: BaseState<T, Draft>
) =>
  create<BaseState<T, Draft> & BaseActions<T, Draft>>((set, get) => ({
    ...initial,
    setList: (list) => set({ list }),
    setFilters: (filters) =>
      set((state) => ({
        filters: { ...state.filters, ...filters },
        pagination: { ...state.pagination, page: 1 },
      })),
    setSort: (sort) => set({ sort }),
    setPage: (page) =>
      set((state) => ({ pagination: { ...state.pagination, page } })),
    setCurrentId: (id) => set({ currentId: id }),
    setCurrent: (item) => set({ current: item }),
    startDraft: (from, fallback) => {
      if (from) {
        // shallow clone to avoid mutations on current
        const clone = JSON.parse(JSON.stringify(from));
        set({ draft: clone });
      } else if (fallback) {
        set({ draft: fallback });
      } else {
        set((state) => ({ draft: state.draft }));
      }
    },
    updateDraft: (patch) =>
      set((state) => ({
        draft: state.draft ? { ...state.draft, ...patch } : ({ ...patch } as Draft),
      })),
    setMode: (mode) => set({ mode }),
    setRequest: (key, status) =>
      set((state) => ({
        request: { ...state.request, [key]: status },
      })),
    setError: (err) => set({ error: err }),
    reset: () => set(initial),
  }));
