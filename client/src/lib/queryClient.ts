import { MutationCache, QueryClient, QueryFunction } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { toApiError } from "@/lib/apiError";

async function throwIfResNotOk(res: Response, url?: string) {
  if (!res.ok) {
    const error = await toApiError(res);
    if (typeof window !== "undefined" && window.electronLog?.write) {
      window.electronLog.write(
        `api error ${res.status} ${res.statusText || ""} ${url || ""} :: ${error.body}`,
      );
    }
    throw error;
  }
}

async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/me", {
      cache: "no-store",
      headers: { "X-Requested-With": "Mill-Manager" },
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.token && data?.user) {
      useAuthStore.getState().setSession({ token: data.token, user: data.user });
      return data.token;
    }
  } catch { /* ignore */ }
  return null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const doFetch = (bearerToken: string | null) =>
    fetch(url, {
      method,
      cache: "no-store",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        "X-Requested-With": "Mill-Manager",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

  let res: Response;
  try {
    res = await doFetch(useAuthStore.getState().token);
  } catch (error) {
    if (typeof window !== "undefined" && window.electronLog?.write) {
      const message = error instanceof Error ? error.message : String(error);
      window.electronLog.write(`api network error ${method} ${url} :: ${message}`);
    }
    throw error;
  }

  if (res.status === 401 && !url.includes("/api/auth/")) {
    const newToken = await refreshToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  await throwIfResNotOk(res, url);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const doFetch = (bearerToken: string | null) =>
      fetch(url, {
        cache: "no-cache",
        headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
        credentials: "include",
      });

    let res: Response;
    try {
      res = await doFetch(useAuthStore.getState().token);
    } catch (error) {
      if (typeof window !== "undefined" && window.electronLog?.write) {
        const message = error instanceof Error ? error.message : String(error);
        window.electronLog.write(`query network error ${url} :: ${message}`);
      }
      throw error;
    }

    if (res.status === 401 && !url.includes("/api/auth/")) {
      const newToken = await refreshToken();
      if (newToken) {
        res = await doFetch(newToken);
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, url);
    return await res.json();
  };

const shouldInvalidateQuery = (key: unknown) =>
  typeof key === "string" && key.startsWith("/api/");

let queryClient: QueryClient;

/*
 * Fallback invalidation: refetch every "/api/" query after any mutation.
 *
 * This is a blunt instrument — one saved sale reloads the entire application —
 * and is being replaced per-mutation by the scoped groups in api/invalidation.ts.
 * A mutation opts out by declaring `meta: { scopedInvalidation: true }`, which is
 * the only signal checked here: a mutation that merely has its own onSuccess (for
 * a toast, or a partial list of keys) still gets the global sweep, so nothing
 * quietly stops refreshing part-way through the migration.
 */
const mutationCache = new MutationCache({
  onSuccess: (_data, _variables, _context, mutation) => {
    if (mutation.options.meta?.scopedInvalidation) return;
    queryClient.invalidateQueries({
      predicate: (query) => shouldInvalidateQuery(query.queryKey[0]),
    });
  },
});

queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export { queryClient };
