/**
 * Unit tests for setActiveWorld() — REQ-WIS-02.
 *
 * Asserts that cookies().set is called with the correct name and options.
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
import { setActiveWorld } from './set-active-world';

describe('setActiveWorld()', () => {
  beforeEach(() => {
    mockCookiesSet.mockReset();
  });

  it('writes dh:world cookie with correct name, value, and options (REQ-WIS-02)', async () => {
    await setActiveWorld('world-abc-123');

    expect(mockCookiesSet).toHaveBeenCalledOnce();
    expect(mockCookiesSet).toHaveBeenCalledWith('dh:world', 'world-abc-123', {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    });
  });

  it('writes the provided worldId value into the cookie', async () => {
    await setActiveWorld('world-xyz-987');

    const [name, value] = mockCookiesSet.mock.calls[0] as [string, string, object];
    expect(name).toBe('dh:world');
    expect(value).toBe('world-xyz-987');
  });
});
