/**
 * Unit tests for setActiveCharacter() — REQ-AC-ACT-01, REQ-DPPMC-LENS-01.
 *
 * Asserts that cookies().set is called twice — once for dh:character, once
 * for dh:world — with the correct values and options.
 * Also asserts dh:role is cleared on character-select (per-world lens, Slice C).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

const mockCookiesSet = vi.fn();
const mockCookiesDelete = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mockCookiesSet,
    delete: mockCookiesDelete,
  }),
}));

// 'use server' files can be imported like regular modules in tests.
import { setActiveCharacter } from './set-active-character';

describe('setActiveCharacter()', () => {
  beforeEach(() => {
    mockCookiesSet.mockReset();
    mockCookiesDelete.mockReset();
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

  // REQ-DPPMC-LENS-01: clearing dh:role on character-select (per-world lens, Slice C)
  it('LENS-01: clears dh:role cookie after writing dh:character + dh:world', async () => {
    await setActiveCharacter('char-abc', 'world-xyz');

    expect(mockCookiesDelete).toHaveBeenCalledWith('dh:role');
  });

  it('LENS-01: clears dh:role AFTER the two set calls (order check)', async () => {
    const callOrder: string[] = [];
    mockCookiesSet.mockImplementation(() => { callOrder.push('set'); });
    mockCookiesDelete.mockImplementation(() => { callOrder.push('delete'); });

    await setActiveCharacter('char-abc', 'world-xyz');

    // Two sets (dh:character, dh:world), then one delete (dh:role)
    expect(callOrder).toEqual(['set', 'set', 'delete']);
  });
});
