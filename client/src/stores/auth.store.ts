import { create } from "zustand";

type AuthState = {
  token: string | null;
  roles: string[];
  permissions: Record<string, boolean>;
};

type AuthActions = {
  login: (payload: { token: string; roles: string[]; permissions: Record<string, boolean> }) => void;
  logout: () => void;
  hasPerm: (key: string) => boolean;
};

const initialState: AuthState = {
  token: null,
  roles: [],
  permissions: {},
};

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  ...initialState,
  login: ({ token, roles, permissions }) => set({ token, roles, permissions }),
  logout: () => set(initialState),
  hasPerm: (key) => Boolean(get().permissions[key]),
}));
