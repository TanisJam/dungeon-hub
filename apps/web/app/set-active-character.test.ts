/**
 * Unit tests for setActiveCharacter() — REQ-AC-ACT-01.
 *
 * Asserts that cookies().set is called twice — once for dh:character, once
 * for dh:world — with the correct values and options.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

const mockCookiesSet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mockCookiesSet,
  }),
}));

// 'use server' files can be imported like regular modules in tests.
import { setActiveCharacter } from './set-active-character';

describe('setActiveCharacter()', () => {
  beforeEach(() => {
    mockCookiesSet.mockReset();
  });

  it('writes dh:character and dh:world cookies (REQ-AC-ACT-01 double-write)', async () => {
    await setActiveCharacter('char-abc-123', 'world-xyz-456');

    expect(mockCookiesSet).toHaveBeenCalledTimes(2);
    expect(mockCookiesSet).toHaveBeenCalledWith('dh:character', 'char-abc-123', {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    });
    expect(mockCookiesSet).toHaveBeenCalledWith('dh:world', 'world-xyz-456', {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    });
  });

  it('both cookie writes use path:/, sameSite:lax, httpOnly:false', async () => {
    await setActiveCharacter('char-111', 'world-222');

    const calls = mockCookiesSet.mock.calls as [string, string, object][];
    for (const [, , opts] of calls) {
      expect(opts).toEqual({ path: '/', sameSite: 'lax', httpOnly: false });
    }
  });

  it('writes the provided characterId and worldId values', async () => {
    await setActiveCharacter('char-specific', 'world-specific');

    const calls = mockCookiesSet.mock.calls as [string, string, object][];
    const charCall = calls.find(([name]) => name === 'dh:character');
    const worldCall = calls.find(([name]) => name === 'dh:world');

    expect(charCall?.[1]).toBe('char-specific');
    expect(worldCall?.[1]).toBe('world-specific');
  });
});
