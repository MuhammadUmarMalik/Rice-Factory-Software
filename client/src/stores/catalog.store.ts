import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";
import type { Product, Account } from "@/types/schema";

type RequestStatus = "idle" | "loading" | "success" | "error";

type CatalogState = {
  products: Product[];
  suppliers: Account[];
  request: {
    products: RequestStatus;
    suppliers: RequestStatus;
  };
  error?: string;
};

type CatalogActions = {
  fetchProducts: () => Promise<void>;
  fetchSuppliers: () => Promise<void>;
  resetCatalog: () => void;
};

const initialState: CatalogState = {
  products: [],
  suppliers: [],
  request: {
    products: "idle",
    suppliers: "idle",
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
  resetCatalog: () => set(initialState),
}));
