/**
 * Unit tests for getActiveWorld() — REQ-WIS-01 (all 4 scenarios).
 *
 * Mocks:
 *   - next/headers cookies() to control `dh:world` cookie
 *   - lib/api (api.get, getMyWorlds) to control API responses
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

let mockCookieValue: string | undefined = undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (key: string) =>
      key === 'dh:world' && mockCookieValue !== undefined
        ? { value: mockCookieValue }
        : undefined,
  }),
}));

// ---------------------------------------------------------------------------
// Mock: lib/api
// ---------------------------------------------------------------------------

const mockApiGet = vi.fn();
const mockGetMyWorlds = vi.fn();

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: unknown, message: string) {
      super(message);
    }
  },
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
  getMyWorlds: (...args: unknown[]) => mockGetMyWorlds(...args),
}));

import { getActiveWorld } from './active-world';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORLD_ALPHA = {
  world: { id: 'world-alpha', name: 'Alpha Realm', slug: 'alpha-realm', callerRole: 'gm' as const },
};
const WORLD_BETA = {
  world: { id: 'world-beta', name: 'Beta Realm', slug: 'beta-realm', callerRole: 'player' as const },
};
const TOKEN = 'test-token';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getActiveWorld()', () => {
  beforeEach(() => {
    mockCookieValue = undefined;
    mockApiGet.mockReset();
    mockGetMyWorlds.mockReset();
  });

  it('Scenario: cookie-valid — returns world from cookie when GET /worlds/:id succeeds', async () => {
    // REQ-WIS-01 Scenario: Cookie present and valid
    mockCookieValue = 'world-alpha';
    mockApiGet.mockResolvedValueOnce(WORLD_ALPHA);

    const result = await getActiveWorld(TOKEN);

    expect(mockApiGet).toHaveBeenCalledWith('/worlds/world-alpha', TOKEN);
    expect(result).toEqual({
      id: 'world-alpha',
      name: 'Alpha Realm',
      slug: 'alpha-realm',
      callerRole: 'gm',
    });
  });

  it('Scenario: cookie-stale — falls back to first world when GET /worlds/:id fails (403/404)', async () => {
    // REQ-WIS-01 Scenario: Cookie present but stale
    mockCookieValue = 'world-stale';
    // First call (cookie id lookup) throws — simulates 403/404
    mockApiGet.mockRejectedValueOnce(new ApiError(403, null, 'API 403: Forbidden'));
    // Second call (fallback world detail) resolves
    mockApiGet.mockResolvedValueOnce(WORLD_BETA);
    mockGetMyWorlds.mockResolvedValueOnce([{ id: 'world-beta', name: 'Beta Realm', slug: 'beta-realm' }]);

    const result = await getActiveWorld(TOKEN);

    expect(mockGetMyWorlds).toHaveBeenCalledWith(TOKEN);
    expect(result).toEqual({
      id: 'world-beta',
      name: 'Beta Realm',
      slug: 'beta-realm',
      callerRole: 'player',
    });
  });

  it('Scenario: cookie-absent-fallback — returns first world when no cookie set', async () => {
    // REQ-WIS-01 Scenario: Cookie absent — fallback to first world
    mockCookieValue = undefined;
    mockGetMyWorlds.mockResolvedValueOnce([{ id: 'world-beta', name: 'Beta Realm', slug: 'beta-realm' }]);
    mockApiGet.mockResolvedValueOnce(WORLD_BETA);

    const result = await getActiveWorld(TOKEN);

    expect(mockGetMyWorlds).toHaveBeenCalledWith(TOKEN);
    expect(mockApiGet).toHaveBeenCalledWith('/worlds/world-beta', TOKEN);
    expect(result).toEqual({
      id: 'world-beta',
      name: 'Beta Realm',
      slug: 'beta-realm',
      callerRole: 'player',
    });
  });

  it('Scenario: zero-worlds-null — returns null when user has no worlds', async () => {
    // REQ-WIS-01 Scenario: User has zero worlds
    mockCookieValue = undefined;
    mockGetMyWorlds.mockResolvedValueOnce([]);

    const result = await getActiveWorld(TOKEN);

    expect(result).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('returns null when token is undefined', async () => {
    const result = await getActiveWorld(undefined);
    expect(result).toBeNull();
  });
});
