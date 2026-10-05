import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * A failed API call. `message` is what the server said (its `{ message }`), ready
 * for a toast; `status` is the HTTP status for code that branches on it. The
 * message used to be "400: {\"message\":…}", and that raw text reached users.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const body = JSON.parse(text) as { message?: unknown; error?: unknown };
      const said = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : null;
      if (said) message = said;
    } catch {
      // Not JSON (a proxy error page, plain text): keep the text as it came.
    }
    // An empty body over HTTP/2 has no statusText either: never hand a toast an empty sentence.
    throw new ApiError(res.status, message.trim() || `Request failed (${res.status})`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
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
