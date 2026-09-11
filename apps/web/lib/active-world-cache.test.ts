/**
 * Proves getActiveWorld() is request-memoized via React's cache() (audit F1,
 * work unit 1 correction — the root layout now resolves callerRole via
 * getActiveWorld() in addition to whatever a page itself resolves; without
 * memoization that's a second call per request).
 *
 * IMPORTANT — what this test can and cannot prove in this repo:
 * Vitest resolves the "default" export condition of the `react` package,
 * whose cache() is a pure passthrough with NO memoization — verified
 * directly against the installed package:
 *   node_modules/react/cjs/react.development.js:
 *     exports.cache = function (fn) {
 *       return function () { return fn.apply(null, arguments); };
 *     };
 * Real per-request memoization is only provided under the "react-server"
 * export condition (node_modules/react/react.react-server.js), which
 * Next.js's RSC compiler resolves at build/runtime — Vitest never does, so
 * a test that imports the real `react` package cannot observe memoization
 * no matter what active-world.ts does.
 *
 * So this test mocks `react`'s cache() with a small per-argument memoizer
 * (a Map keyed by JSON.stringify(args), matching cache()'s documented
 * semantics) and proves the WIRING is correct: active-world.ts really does
 * wrap its implementation in cache(), so two calls with the same token
 * collapse into one underlying fetch. It does NOT exercise Next.js's own
 * request-scoped cache lifecycle (cache resetting between requests) — that
 * is Next's responsibility, not this module's, and isn't reproducible
 * outside a real Next.js render.
 *
 * Isolated into its own file (not active-world.test.ts): the mocked
 * cache's memo Map lives at module scope, for the lifetime of this file's
 * module graph. active-world.test.ts's other scenarios all call
 * getActiveWorld() with the SAME literal token but different mocked
 * cookie/API responses — sharing a file would make a later scenario
 * silently reuse an earlier one's cached result. Vitest isolates modules
 * per test file by default, so a dedicated file gets a fresh Map.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <Fn extends (...args: never[]) => unknown>(fn: Fn): Fn => {
      const memo = new Map<string, ReturnType<Fn>>();
      return ((...args: Parameters<Fn>) => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args) as ReturnType<Fn>);
        return memo.get(key);
      }) as Fn;
    },
  };
});

let mockCookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (key: string) =>
      key === 'dh:world' && mockCookieValue !== undefined ? { value: mockCookieValue } : undefined,
  }),
}));

const mockApiGet = vi.fn();
const mockGetMyWorlds = vi.fn();
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: unknown,
      message: string,
    ) {
      super(message);
    }
  },
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
  getMyWorlds: (...args: unknown[]) => mockGetMyWorlds(...args),
}));

import { getActiveWorld } from './active-world';

const WORLD_ALPHA = {
  id: 'world-alpha',
  name: 'Alpha Realm',
  slug: 'alpha-realm',
  callerRole: 'gm' as const,
};

describe('getActiveWorld() — request memoization via cache()', () => {
  beforeEach(() => {
    mockCookieValue = 'world-alpha';
    mockApiGet.mockReset();
    mockGetMyWorlds.mockReset();
  });

  it('shares one underlying fetch across two calls with the same token', async () => {
    mockApiGet.mockResolvedValue(WORLD_ALPHA);

    const first = await getActiveWorld('token-shared');
    const second = await getActiveWorld('token-shared');

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).toEqual({
      id: 'world-alpha',
      name: 'Alpha Realm',
      slug: 'alpha-realm',
      callerRole: 'gm',
    });
  });

  it('does not share the cache across different tokens', async () => {
    mockApiGet.mockResolvedValue(WORLD_ALPHA);

    await getActiveWorld('token-a');
    await getActiveWorld('token-b');

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});
