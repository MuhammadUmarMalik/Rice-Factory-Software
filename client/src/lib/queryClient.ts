import { MutationCache, QueryClient, QueryFunction } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";

async function throwIfResNotOk(res: Response, url?: string) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (typeof window !== "undefined" && window.electronLog?.write) {
      window.electronLog.write(
        `api error ${res.status} ${res.statusText || ""} ${url || ""} :: ${text}`,
      );
    }
    throw new Error(`${res.status}: ${text}`);
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

const mutationCache = new MutationCache({
  onSuccess: () => {
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
