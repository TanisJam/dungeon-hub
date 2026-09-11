/**
 * Unit tests for getActiveWorld() — REQ-WIS-01 (all 4 scenarios).
 *
 * Mocks:
 *   - next/headers cookies() to control `dh:world` cookie
 *   - lib/api (api.get, getMyWorlds) to control API responses
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

let mockCookieValue: string | undefined ;

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

// GET /worlds/:id returns the world directly (top-level), not nested under 'world:'.
// Matches the actual API route response in apps/api/src/http/routes/worlds.ts.
const WORLD_ALPHA = {
  id: 'world-alpha',
  name: 'Alpha Realm',
  slug: 'alpha-realm',
  callerRole: 'gm' as const,
};
const WORLD_BETA = {
  id: 'world-beta',
  name: 'Beta Realm',
  slug: 'beta-realm',
  callerRole: 'player' as const,
};
const TOKEN = 'test-token';

/**
 * getActiveWorld's no-cookie path fires GET /characters?status=active and
 * getMyWorlds together, so a mock keyed on CALL ORDER hands the roster request
 * whatever the next mockResolvedValueOnce happens to be. These helpers route by
 * URL instead: the assertions then describe the contract rather than the order
 * the implementation happens to issue its requests in.
 */
function routeApiGet(routes: {
  worlds?: Record<string, unknown>;
  activeRoster?: Array<{ worldId?: string | null }> | null;
}) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === '/characters?status=active') {
      return routes.activeRoster === null
        ? Promise.reject(new Error('roster unavailable'))
        : Promise.resolve({ data: routes.activeRoster ?? [] });
    }
    const match = /^\/worlds\/(.+)$/.exec(path);
    if (match) {
      const world = routes.worlds?.[match[1]!];
      return world ? Promise.resolve(world) : Promise.reject(new Error('world not found'));
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

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
    mockGetMyWorlds.mockResolvedValueOnce([{ id: 'world-beta', name: 'Beta Realm', slug: 'beta-realm' }]);
    // routeApiGet rejects any world it does not know, so 'world-stale' stands in
    // for the 403/404 the cookie lookup gets, and the fallback resolves.
    routeApiGet({ worlds: { 'world-beta': WORLD_BETA }, activeRoster: [] });

    const result = await getActiveWorld(TOKEN);

    expect(mockGetMyWorlds).toHaveBeenCalledWith(TOKEN);
    expect(result).toEqual({
      id: 'world-beta',
      name: 'Beta Realm',
      slug: 'beta-realm',
      callerRole: 'player',
    });
  });

  it('Scenario: cookie-absent-fallback — returns the only world when no cookie set', async () => {
    // REQ-WIS-01 Scenario: Cookie absent — fallback
    mockCookieValue = undefined;
    mockGetMyWorlds.mockResolvedValueOnce([{ id: 'world-beta', name: 'Beta Realm', slug: 'beta-realm' }]);
    routeApiGet({ worlds: { 'world-beta': WORLD_BETA }, activeRoster: [] });

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

  it('no cookie: picks the world the user has an active character in, not the first one', async () => {
    // Measured on the E2E account: four worlds, every character in the fourth.
    // List order put a stale membership first, so the roster, the guild feed and
    // anything shared all pointed at a world holding none of the user's characters.
    mockCookieValue = undefined;
    mockGetMyWorlds.mockResolvedValueOnce([
      { id: 'world-alpha', name: 'Alpha Realm', slug: 'alpha-realm' },
      { id: 'world-beta', name: 'Beta Realm', slug: 'beta-realm' },
    ]);
    routeApiGet({
      worlds: { 'world-alpha': WORLD_ALPHA, 'world-beta': WORLD_BETA },
      activeRoster: [{ worldId: 'world-beta' }],
    });

    const result = await getActiveWorld(TOKEN);

    expect(mockApiGet).toHaveBeenCalledWith('/worlds/world-beta', TOKEN);
    expect(mockApiGet).not.toHaveBeenCalledWith('/worlds/world-alpha', TOKEN);
    expect(result?.id).toBe('world-beta');
  });

  it('no cookie: falls back to list order when no world holds an active character', async () => {
    mockCookieValue = undefined;
    mockGetMyWorlds.mockResolvedValueOnce([
      { id: 'world-alpha', name: 'Alpha Realm', slug: 'alpha-realm' },
      { id: 'world-beta', name: 'Beta Realm', slug: 'beta-realm' },
    ]);
    routeApiGet({ worlds: { 'world-alpha': WORLD_ALPHA, 'world-beta': WORLD_BETA }, activeRoster: [] });

    const result = await getActiveWorld(TOKEN);

    expect(result?.id).toBe('world-alpha');
  });

  it('no cookie: a failing roster lookup degrades to list order, it does not break the page', async () => {
    mockCookieValue = undefined;
    mockGetMyWorlds.mockResolvedValueOnce([
      { id: 'world-alpha', name: 'Alpha Realm', slug: 'alpha-realm' },
    ]);
    routeApiGet({ worlds: { 'world-alpha': WORLD_ALPHA }, activeRoster: null });

    const result = await getActiveWorld(TOKEN);

    expect(result?.id).toBe('world-alpha');
  });

  it('the cookie still wins over the active-character preference', async () => {
    // Deliberately switching to a world you have no character in must keep working.
    mockCookieValue = 'world-alpha';
    routeApiGet({
      worlds: { 'world-alpha': WORLD_ALPHA, 'world-beta': WORLD_BETA },
      activeRoster: [{ worldId: 'world-beta' }],
    });

    const result = await getActiveWorld(TOKEN);

    expect(result?.id).toBe('world-alpha');
  });

  it('Scenario: zero-worlds-null — returns null when user has no worlds', async () => {
    // REQ-WIS-01 Scenario: User has zero worlds
    mockCookieValue = undefined;
    mockGetMyWorlds.mockResolvedValueOnce([]);
    routeApiGet({ activeRoster: [] });

    const result = await getActiveWorld(TOKEN);

    expect(result).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalledWith(expect.stringMatching(/^\/worlds\//), TOKEN);
  });

  it('returns null when token is undefined', async () => {
    const result = await getActiveWorld(undefined);
    expect(result).toBeNull();
  });
});
