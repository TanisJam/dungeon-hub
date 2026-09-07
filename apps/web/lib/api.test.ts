/**
 * Tests for lib/api.ts request() — demo-resilience timeout contract.
 *
 * The Fastify API lives behind a home-lab tunnel that can accept a
 * connection and never answer. Before this change, `request()` had no
 * timeout and no network-failure handling, so a hung tunnel hung the
 * caller indefinitely and a rejected fetch surfaced as a raw TypeError
 * instead of something callers could discriminate against `ApiError`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    SUPABASE_URL: 'http://localhost',
    SUPABASE_ANON_KEY: 'test-anon-key',
    API_URL: 'http://localhost:4000',
  },
}));

import { api, ApiError, ApiNetworkError } from './api';

describe('api client resilience', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed JSON on a successful response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await api.get<{ ok: boolean }>('/ping');

    expect(result).toEqual({ ok: true });
  });

  it('still throws ApiError (with status + body) for a real HTTP error response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 }),
    );

    await expect(api.get('/missing')).rejects.toMatchObject(
      expect.objectContaining({ status: 404 }),
    );

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 }),
    );
    await expect(api.get('/missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiNetworkError when the connection drops while reading the body', async () => {
    // Headers arrived, then the stream died — a realistic tunnel failure that
    // rejects at res.text(), not at fetch().
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.reject(new TypeError('terminated')),
    } as unknown as Response);

    await expect(api.get('/half-answered')).rejects.toBeInstanceOf(ApiNetworkError);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.reject(new TypeError('terminated')),
    } as unknown as Response);
    await expect(api.get('/half-answered')).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws a typed ApiNetworkError (kind: network) when fetch rejects, not a raw TypeError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const err = await api.get('/ping').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiNetworkError);
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as ApiNetworkError).kind).toBe('network');
  });

  it('throws a typed ApiNetworkError (kind: timeout) when fetch aborts on the request timeout', async () => {
    // Simulate what `fetch` throws when its AbortSignal.timeout(...) fires —
    // a DOMException named "TimeoutError" — without waiting for a real timeout.
    const timeoutError = Object.assign(new Error('The operation timed out.'), {
      name: 'TimeoutError',
    });
    fetchMock.mockRejectedValueOnce(timeoutError);

    const err = await api.get('/slow').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiNetworkError);
    expect((err as ApiNetworkError).kind).toBe('timeout');
  });

  it('passes an AbortSignal to fetch so a hung backend gets cut off', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await api.get('/ping');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
