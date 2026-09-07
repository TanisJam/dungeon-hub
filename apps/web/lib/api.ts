import { env } from '@/lib/env';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

/**
 * Thrown when `request()` never got an HTTP response at all — the fetch
 * itself rejected (network failure) or was aborted by the timeout below.
 * Deliberately NOT an ApiError: it has no real HTTP status to report, so
 * giving it a fake one (e.g. 0 or 599) would mislead status-based branching
 * (`err.status === 404`, etc.) elsewhere in the codebase. `kind` lets callers
 * tell a hung/unreachable backend apart from a generic network blip.
 */
export type ApiNetworkErrorKind = 'timeout' | 'network';

export class ApiNetworkError extends Error {
  constructor(
    public readonly kind: ApiNetworkErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiNetworkError';
  }
}

// The Fastify API lives behind a home-lab Cloudflare tunnel, which can accept
// a connection and then never answer. 10s is long enough for any real API
// call in this app (no long-running uploads/exports go through this client)
// but short enough that a hung tunnel doesn't hang a Server Action or page
// render indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;

type Init = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
};

async function request<T>(path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${env.API_URL}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    throw new ApiNetworkError(
      isTimeout ? 'timeout' : 'network',
      isTimeout
        ? `Request to ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `Network error requesting ${path}`,
      { cause: err },
    );
  }

  // The body is a second network hop: a tunnel can answer with headers and
  // then drop mid-stream, which rejects here rather than at the fetch above.
  // Surface it as the same typed network failure instead of a raw TypeError.
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw new ApiNetworkError(
      'network',
      `Connection dropped while reading the response body for ${path}`,
      { cause: err },
    );
  }
  const parsed = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, parsed, `API ${res.status}: ${text}`);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

export const api = {
  get: <T>(path: string, accessToken?: string) => request<T>(path, { accessToken }),
  post: <T>(path: string, body?: unknown, accessToken?: string) =>
    request<T>(path, { method: 'POST', body, accessToken }),
  put: <T>(path: string, body?: unknown, accessToken?: string) =>
    request<T>(path, { method: 'PUT', body, accessToken }),
  patch: <T>(path: string, body?: unknown, accessToken?: string) =>
    request<T>(path, { method: 'PATCH', body, accessToken }),
  delete: <T>(path: string, accessToken?: string) =>
    request<T>(path, { method: 'DELETE', accessToken }),
};

// ---------------------------------------------------------------------------
// Server-side helpers (call these from Server Components / Server Actions)
// ---------------------------------------------------------------------------

export type WorldRow = { id: string; name: string; slug: string };

/**
 * Returns the worlds where the authenticated user has a worldMembers row.
 * Calls GET /worlds?mine=1. Must be called server-side with a valid access token.
 */
export async function getMyWorlds(accessToken: string): Promise<WorldRow[]> {
  const res = await request<{ worlds: WorldRow[] }>('/worlds?mine=1', { accessToken });
  return res.worlds;
}
