import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";
import type { Product, Account } from "@/types/schema";

type RequestStatus = "idle" | "loading" | "success" | "error";

type CatalogState = {
  products: Product[];
  suppliers: Account[];
  trucks: { id: number; plate: string }[];
  units: string[];
  request: {
    products: RequestStatus;
    suppliers: RequestStatus;
    trucks: RequestStatus;
    units: RequestStatus;
  };
  error?: string;
};

type CatalogActions = {
  fetchProducts: () => Promise<void>;
  fetchSuppliers: () => Promise<void>;
  fetchTrucks: () => Promise<void>;
  fetchUnits: () => Promise<void>;
  resetCatalog: () => void;
};

const initialState: CatalogState = {
  products: [],
  suppliers: [],
  trucks: [],
  units: [],
  request: {
    products: "idle",
    suppliers: "idle",
    trucks: "idle",
    units: "idle",
  },
  error: undefined,
};

export const useCatalogStore = create<CatalogState & CatalogActions>((set) => ({
  ...initialState,
  fetchProducts: async () => {
    set((state) => ({ request: { ...state.request, products: "loading" as RequestStatus }, error: undefined }));
    try {
      const res = await apiRequest("GET", "/api/products");
      const data = await res.json();
      set((state) => ({ products: data, request: { ...state.request, products: "success" as RequestStatus } }));
    } catch (err: any) {
      set((state) => ({
        request: { ...state.request, products: "error" as RequestStatus },
        error: err?.message || "Failed to fetch products",
      }));
    }
  },
  fetchSuppliers: async () => {
    set((state) => ({ request: { ...state.request, suppliers: "loading" as RequestStatus }, error: undefined }));
    try {
      const res = await apiRequest("GET", "/api/accounts?type=supplier");
      const data = await res.json();
      set((state) => ({ suppliers: data, request: { ...state.request, suppliers: "success" as RequestStatus } }));
    } catch (err: any) {
      set((state) => ({
        request: { ...state.request, suppliers: "error" as RequestStatus },
        error: err?.message || "Failed to fetch suppliers",
      }));
    }
  },
  fetchTrucks: async () => {
    set((state) => ({ request: { ...state.request, trucks: "loading" as RequestStatus }, error: undefined }));
    try {
      const res = await apiRequest("GET", "/api/trucks");
      const data = await res.json();
      set((state) => ({ trucks: data, request: { ...state.request, trucks: "success" as RequestStatus } }));
    } catch (err: any) {
      set((state) => ({
        request: { ...state.request, trucks: "error" as RequestStatus },
        error: err?.message || "Failed to fetch trucks",
      }));
    }
  },
  fetchUnits: async () => {
    set((state) => ({ request: { ...state.request, units: "loading" as RequestStatus }, error: undefined }));
    try {
      const res = await apiRequest("GET", "/api/units");
      const data = await res.json();
      set((state) => ({ units: data, request: { ...state.request, units: "success" as RequestStatus } }));
    } catch (err: any) {
      set((state) => ({
        request: { ...state.request, units: "error" as RequestStatus },
        error: err?.message || "Failed to fetch units",
      }));
    }
  },
  resetCatalog: () => set(initialState),
}));
