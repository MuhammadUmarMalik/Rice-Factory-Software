import { apiRequest } from "@/lib/queryClient";

const BASE_URL = typeof window !== "undefined" ? "" : "";

export async function apiGet<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", `${BASE_URL}${url}`);
  return res.json();
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiRequest("POST", `${BASE_URL}${url}`, data);
  return res.json();
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiRequest("PATCH", `${BASE_URL}${url}`, data);
  return res.json();
}

export async function apiDelete(url: string): Promise<void> {
  await apiRequest("DELETE", `${BASE_URL}${url}`);
}
