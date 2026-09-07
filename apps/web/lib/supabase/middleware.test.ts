/**
 * Tests for updateSession() — demo-resilience fail-open contract.
 *
 * The home-lab Supabase backend sits behind a Cloudflare tunnel that can
 * reject connections or hang. This middleware runs on every non-static
 * route (apps/web/middleware.ts), so a bare, unguarded `getUser()` call
 * turns any backend hiccup into a 500 on the whole site, including the
 * public landing page. These tests lock in that a rejected or hanging
 * `getUser()` never propagates out of updateSession — it must always
 * resolve with a response so the request proceeds as unauthenticated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    SUPABASE_URL: 'http://localhost',
    SUPABASE_ANON_KEY: 'test-anon-key',
    API_URL: 'http://localhost:4000',
  },
}));

const { mockGetUser, mockCreateServerClient } = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockCreateServerClient = vi.fn(() => ({
    auth: { getUser: mockGetUser },
  }));
  return { mockGetUser, mockCreateServerClient };
});

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}));

const { mockNextResponseNext } = vi.hoisted(() => {
  const mockNextResponseNext = vi.fn(() => ({ cookies: { set: vi.fn() } }));
  return { mockNextResponseNext };
});

vi.mock('next/server', () => ({
  NextResponse: { next: mockNextResponseNext },
}));

import { updateSession } from './middleware';

function fakeRequest() {
  return {
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  } as unknown as Parameters<typeof updateSession>[0];
}

describe('updateSession() fail-open contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNextResponseNext.mockImplementation(() => ({ cookies: { set: vi.fn() } }));
  });

  it('returns a response instead of throwing when getUser() rejects', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

    const response = await updateSession(fakeRequest());

    expect(response).toBeDefined();
    expect(mockCreateServerClient).toHaveBeenCalledOnce();
  });

  it('returns a response instead of hanging when getUser() never resolves past the timeout', async () => {
    mockGetUser.mockImplementation(() => new Promise(() => {}));

    // Small timeout so the test stays fast — production uses the real default.
    const response = await updateSession(fakeRequest(), 20);

    expect(response).toBeDefined();
  });

  it('logs the failure server-side rather than swallowing it silently', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetUser.mockRejectedValueOnce(new Error('boom'));

    await updateSession(fakeRequest());

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('still awaits a successful getUser() call (happy path unaffected)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });

    const response = await updateSession(fakeRequest());

    expect(response).toBeDefined();
    expect(mockGetUser).toHaveBeenCalledOnce();
  });
});
