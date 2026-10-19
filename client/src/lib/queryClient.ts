import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { viewHeaders } from "./adminMode";
import { parseFieldErrors, serverErrorText, type FieldError } from "./apiErrors";

/**
 * A failed API call. `message` is what the server said (its `{ message }`), ready
 * for a toast; `status` is the HTTP status for code that branches on it. The
 * message used to be "400: {\"message\":…}", and that raw text reached users.
 */
export class ApiError extends Error {
  /** Which fields were refused and why (a 400's `errors`); empty otherwise. See describeApiError. */
  public fieldErrors: FieldError[];
  /** The server's stable code for the error (`code`), when it sends one. */
  public code: string | null;
  /** `body` is the parsed JSON the server sent, for errors that carry more than a message. */
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = parseFieldErrors(body);
    const code = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
    this.code = typeof code === "string" ? code : null;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    let parsed: unknown;
    try {
      const body = JSON.parse(text) as { message?: unknown; error?: unknown };
      parsed = body;
      const said = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : null;
      // A stable `code` is worded in the user's language (srv_<code>); else the server's sentence.
      if (said) message = serverErrorText(body, said);
    } catch {
      // Not JSON (a proxy error page, plain text): keep the text as it came.
    }
    // An empty body over HTTP/2 has no statusText either: never hand a toast an empty sentence.
    throw new ApiError(res.status, message.trim() || `Request failed (${res.status})`, parsed);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: { ...viewHeaders(), ...(data ? { "Content-Type": "application/json" } : {}) },
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
        headers: viewHeaders(),
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
