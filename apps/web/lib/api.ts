import { env } from '@/lib/env';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

type Init = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
};

async function request<T>(path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`;

  const res = await fetch(`${env.API_URL}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
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
};
