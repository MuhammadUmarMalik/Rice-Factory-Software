import { create } from "zustand";

type AppState = {
  orgId: string | null;
  userId: string | null;
  featureFlags: Record<string, boolean>;
  theme: "light" | "dark";
};

type AppActions = {
  setOrg: (id: string | null) => void;
  setUser: (id: string | null) => void;
  setTheme: (theme: "light" | "dark") => void;
  setFeatureFlag: (key: string, value: boolean) => void;
  resetApp: () => void;
};

const initialState: AppState = {
  orgId: null,
  userId: null,
  featureFlags: {},
  theme: "light",
};

export const useAppStore = create<AppState & AppActions>((set) => ({
  ...initialState,
  setOrg: (id) => set({ orgId: id }),
  setUser: (id) => set({ userId: id }),
  setTheme: (theme) => set({ theme }),
  setFeatureFlag: (key, value) =>
    set((state) => ({ featureFlags: { ...state.featureFlags, [key]: value } })),
  resetApp: () => set(initialState),
}));
