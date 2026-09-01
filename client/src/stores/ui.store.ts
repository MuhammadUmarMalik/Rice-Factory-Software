import { create } from "zustand";

type ModalState = {
  open: boolean;
  payload?: unknown;
};

type ViewMode = "view" | "edit" | "create" | null;

type UIState = {
  modals: Record<string, ModalState>;
  drawers: Record<string, ModalState>;
  viewModes: Record<string, ViewMode>;
  globalBusy: boolean;
};

type UIActions = {
  openModal: (key: string, payload?: unknown) => void;
  closeModal: (key: string) => void;
  openDrawer: (key: string, payload?: unknown) => void;
  closeDrawer: (key: string) => void;
  setViewMode: (key: string, mode: ViewMode) => void;
  resetUI: () => void;
  setGlobalBusy: (flag: boolean) => void;
};

const initialState: UIState = {
  modals: {},
  drawers: {},
  viewModes: {},
  globalBusy: false,
};

export const useUIStore = create<UIState & UIActions>((set) => ({
  ...initialState,
  openModal: (key, payload) =>
    set((state) => ({
      modals: { ...state.modals, [key]: { open: true, payload } },
    })),
  closeModal: (key) =>
    set((state) => {
      if (!state.modals[key]) return state;
      const next = { ...state.modals, [key]: { open: false } };
      return { ...state, modals: next };
    }),
  openDrawer: (key, payload) =>
    set((state) => ({
      drawers: { ...state.drawers, [key]: { open: true, payload } },
    })),
  closeDrawer: (key) =>
    set((state) => {
      if (!state.drawers[key]) return state;
      const next = { ...state.drawers, [key]: { open: false } };
      return { ...state, drawers: next };
    }),
  setViewMode: (key, mode) =>
    set((state) => ({
      viewModes: { ...state.viewModes, [key]: mode },
    })),
  setGlobalBusy: (flag) => set({ globalBusy: flag }),
  resetUI: () => set(initialState),
}));
