import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";
import type {
  PurchaseDraft,
  PurchaseListItem,
  PurchaseMode,
  RequestStatus,
} from "./types";

type PurchaseState = {
  list: PurchaseListItem[];
  pagination: { page: number; pageSize: number; total: number };
  filters: { supplierId?: string; status?: string; dateRange?: [string, string] };
  sort: { field: string; dir: "asc" | "desc" } | null;
  currentId: number | null;
  current: PurchaseListItem | null;
  draft: PurchaseDraft | null;
  mode: PurchaseMode;
  request: { list: RequestStatus; detail: RequestStatus };
  error?: string;
};

type PurchaseActions = {
  setList: (list: PurchaseListItem[]) => void;
  setFilters: (filters: Partial<PurchaseState["filters"]>) => void;
  setSort: (sort: PurchaseState["sort"]) => void;
  setPage: (page: number) => void;
  setCurrentId: (id: number | null) => void;
  setCurrent: (purchase: PurchaseListItem | null) => void;
  startDraft: (from?: PurchaseListItem | null) => void;
  updateDraft: (patch: Partial<PurchaseDraft>) => void;
  setMode: (mode: PurchaseMode) => void;
  fetchList: () => Promise<void>;
  fetchById: (id: number) => Promise<void>;
  resetPurchase: () => void;
  resetAll: () => void;
};

const initialState: PurchaseState = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0 },
  filters: {},
  sort: null,
  currentId: null,
  current: null,
  draft: null,
  mode: null,
  request: { list: "idle", detail: "idle" },
  error: undefined,
};

export const usePurchaseStore = create<PurchaseState & PurchaseActions>((set, get) => ({
  ...initialState,
  setList: (list) => set({ list }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters }, pagination: { ...state.pagination, page: 1 } })),
  setSort: (sort) => set({ sort }),
  setPage: (page) =>
    set((state) => ({ pagination: { ...state.pagination, page } })),
  setCurrentId: (id) => set({ currentId: id }),
  setCurrent: (purchase) => set({ current: purchase }),
  startDraft: (from) =>
    set((state) => {
      const source = from ?? state.current;
      if (!source) {
        return {
          draft: {
            moundBaseKg: "40",
            supplierId: "",
            brokerCommissionPercent: "0",
            paidAmount: "0",
            items: [],
            charges: [],
          },
        } as Partial<PurchaseState>;
      }
      return {
        draft: {
          id: source.id,
          purchaseDate: source.purchaseDate ? new Date(source.purchaseDate).toISOString().slice(0, 10) : undefined,
          moundBaseKg: "40",
          billNo: (source as any).billNo ?? "",
          bookNo: (source as any).bookNo ?? "",
          supplierId: String((source as any).supplierId ?? ""),
          vehicleNumber: (source as any).vehicleNumber ?? "",
          brokerId: (source as any).brokerId ? String((source as any).brokerId) : "none",
          brokerCommissionPercent: (source as any).brokerCommissionPercent ?? "0",
          paidAmount: (source as any).paidAmount ?? "0",
          notes: (source as any).notes ?? "",
          items: ((source as any).items || []).map((item: any) => ({
            productId: String(item.productId ?? ""),
            marka: item.marka || "",
            bags: item.bags || "0",
            fillingPerBagKg: item.fillingPerBagKg || "0",
            looseKgs: item.looseKgs || "0",
            lessKg: item.lessKg || "0",
            bardanaKatKg: item.bardanaKatKg || "0",
            rate: item.rate || "0",
            rateUnit: item.rateUnit || "kg",
          })),
          charges: ((source as any).charges || []).map((c: any) => ({
            type: c.type,
            mode: c.mode || "add",
            amount: c.amount || "0",
            accountId: c.accountId ? String(c.accountId) : "none",
          })),
        },
      };
    }),
  updateDraft: (patch) =>
    set((state) => ({
      draft: state.draft ? { ...state.draft, ...patch } : ({ ...patch } as PurchaseDraft),
    })),
  setMode: (mode) => set({ mode }),
  fetchList: async () => {
    set((state) => ({ request: { ...state.request, list: "loading" as RequestStatus }, error: undefined }));
    try {
      const res = await apiRequest("GET", "/api/reports/purchases");
      const data = await res.json();
      set((state) => ({
        list: data,
        request: { ...state.request, list: "success" as RequestStatus },
      }));
    } catch (err: any) {
      set((state) => ({
        request: { ...state.request, list: "error" as RequestStatus },
        error: err?.message || "Failed to fetch purchases",
      }));
    }
  },
  fetchById: async (id: number) => {
    set((state) => ({ request: { ...state.request, detail: "loading" as RequestStatus }, error: undefined, currentId: id }));
    try {
      const res = await apiRequest("GET", `/api/purchases/${id}`);
      const data = await res.json();
      set((state) => ({
        current: data,
        request: { ...state.request, detail: "success" as RequestStatus },
      }));
    } catch (err: any) {
      set((state) => ({
        request: { ...state.request, detail: "error" as RequestStatus },
        error: err?.message || `Failed to fetch purchase ${id}`,
      }));
    }
  },
  resetPurchase: () =>
    set({
      current: null,
      currentId: null,
      draft: null,
      mode: null,
    }),
  resetAll: () => set(initialState),
}));
