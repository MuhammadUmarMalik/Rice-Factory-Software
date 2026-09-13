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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = useAuthStore.getState().token;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        "X-Requested-With": "Mill-Manager",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch (error) {
    if (typeof window !== "undefined" && window.electronLog?.write) {
      const message = error instanceof Error ? error.message : String(error);
      window.electronLog.write(`api network error ${method} ${url} :: ${message}`);
    }
    throw error;
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
    const token = useAuthStore.getState().token;
    const url = queryKey.join("/") as string;
    let res: Response;
    try {
      res = await fetch(url, {
        cache: "no-cache",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
    } catch (error) {
      if (typeof window !== "undefined" && window.electronLog?.write) {
        const message = error instanceof Error ? error.message : String(error);
        window.electronLog.write(`query network error ${url} :: ${message}`);
      }
      throw error;
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
