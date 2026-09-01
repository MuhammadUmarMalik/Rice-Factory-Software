import { create } from "zustand";

type AuthState = {
  token: string | null;
  user: { id: number; username: string; fullName: string; role: string } | null;
};

type AuthActions = {
  setSession: (payload: { token: string | null; user: AuthState["user"] }) => void;
  logout: () => void;
};

const initialState: AuthState = {
  token: null,
  user: null,
};

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  ...initialState,
  setSession: ({ token, user }) => set({ token, user }),
  logout: () => set(initialState),
}));
