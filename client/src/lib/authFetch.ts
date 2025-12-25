import { useAuthStore } from "@/stores/auth.store";

export function getAuthHeaders(extra?: HeadersInit) {
  const token = useAuthStore.getState().token;
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  } as HeadersInit;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers = getAuthHeaders(options.headers);
  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}
