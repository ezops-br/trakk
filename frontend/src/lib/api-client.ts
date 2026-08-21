const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = "Request failed";
    let details: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; details?: string };
      if (body.error) message = body.error;
      if (body.details) details = body.details;
    } catch {
      // ignore JSON parse errors on error bodies
    }
    const apiError = new ApiError(res.status, message, details);
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw apiError;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: "GET" });
  },

  getWithSignal: async <T>(
    path: string,
    signal: AbortSignal,
    params?: Record<string, string>,
  ): Promise<T> => {
    const url = new URL(`${BASE_URL}${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new Error((body.error as string) ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  del<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "DELETE",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
};
