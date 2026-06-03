/**
 * Unit tests for getActiveCharacter() — REQ-AC-RES-01 (all 6 scenarios).
 *
 * Mocks:
 *   - next/headers cookies() to control `dh:character` and `dh:world` cookies
 *   - lib/api (api.get) to control the GET /characters?status=active response
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

let mockCharacterCookie: string | undefined = undefined;
let mockWorldCookie: string | undefined = undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (key: string) => {
      if (key === 'dh:character' && mockCharacterCookie !== undefined) {
        return { value: mockCharacterCookie };
      }
      if (key === 'dh:world' && mockWorldCookie !== undefined) {
        return { value: mockWorldCookie };
      }
      return undefined;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mock: lib/api
// ---------------------------------------------------------------------------

const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

import { getActiveCharacter } from './active-character';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'test-token';

const CHAR_A = {
  id: 'char-a',
  worldId: 'world-1',
  name: 'Brann Ironfist',
  status: 'active',
  lineage: 'Enano · Guerrero 5',
  hpCurrent: 44,
  hpMax: 52,
};

const CHAR_B = {
  id: 'char-b',
  worldId: 'world-1',
  name: 'Lyra Moonwhisper',
  status: 'active',
  lineage: 'Elfo · Bardo 3',
  hpCurrent: 18,
  hpMax: 24,
};

const CHAR_RETIRED = {
  id: 'char-retired',
  worldId: 'world-1',
  name: 'Gareth Old',
  status: 'retired',
  lineage: '',
  hpCurrent: null,
  hpMax: null,
};

const CHAR_OTHER_WORLD = {
  id: 'char-c',
  worldId: 'world-2',
  name: 'Zara Vex',
  status: 'active',
  lineage: 'Tiefling · Mago 2',
  hpCurrent: 10,
  hpMax: 12,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getActiveCharacter()', () => {
  beforeEach(() => {
    mockCharacterCookie = undefined;
    mockWorldCookie = undefined;
    mockApiGet.mockReset();
  });

  it('cookie-valid — returns character from cookie match', async () => {
    // REQ-AC-RES-01 scenario 1: cookie present and valid
    mockCharacterCookie = 'char-a';
    mockWorldCookie = 'world-1';
    mockApiGet.mockResolvedValueOnce({ data: [CHAR_A, CHAR_B] });

    const result = await getActiveCharacter(TOKEN);

    expect(mockApiGet).toHaveBeenCalledOnce();
    expect(mockApiGet).toHaveBeenCalledWith('/characters?status=active', TOKEN);
    expect(result).toEqual(CHAR_A);
  });

  it('cookie-stale (non-active status) — falls back to first active in world', async () => {
    // REQ-AC-RES-01 scenario 2: cookie points to retired character
    mockCharacterCookie = 'char-retired';
    mockWorldCookie = 'world-1';
    // The roster only returns active chars; retired char not in the response
    mockApiGet.mockResolvedValueOnce({ data: [CHAR_B] });

    const result = await getActiveCharacter(TOKEN);

    expect(mockApiGet).toHaveBeenCalledOnce();
    // Falls back to first active char in world
    expect(result).toEqual(CHAR_B);
  });

  it('cross-world mismatch — falls back to first active in active world', async () => {
    // REQ-AC-RES-01 scenario 3: cookie char belongs to world-2 but active world is world-1
    mockCharacterCookie = 'char-c';
    mockWorldCookie = 'world-1';
    // Roster has chars from both worlds
    mockApiGet.mockResolvedValueOnce({ data: [CHAR_A, CHAR_OTHER_WORLD] });

    const result = await getActiveCharacter(TOKEN);

    expect(mockApiGet).toHaveBeenCalledOnce();
    // char-c is in world-2, active world is world-1 → falls back to CHAR_A
    expect(result).toEqual(CHAR_A);
  });

  it('cookie-absent — returns first active character', async () => {
    // REQ-AC-RES-01 scenario 4: no dh:character cookie
    mockCharacterCookie = undefined;
    mockWorldCookie = 'world-1';
    mockApiGet.mockResolvedValueOnce({ data: [CHAR_A, CHAR_B] });

    const result = await getActiveCharacter(TOKEN);

    expect(mockApiGet).toHaveBeenCalledOnce();
    expect(result).toEqual(CHAR_A);
  });

  it('zero active characters — returns null', async () => {
    // REQ-AC-RES-01 scenario 5: no active characters in the world
    mockCharacterCookie = undefined;
    mockWorldCookie = 'world-1';
    mockApiGet.mockResolvedValueOnce({ data: [] });

    const result = await getActiveCharacter(TOKEN);

    expect(result).toBeNull();
  });

  it('no token — returns null immediately, no API call', async () => {
    // REQ-AC-RES-01 scenario 6: token is undefined
    const result = await getActiveCharacter(undefined);

    expect(result).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
