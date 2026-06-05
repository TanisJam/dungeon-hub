/**
 * Unit tests for setActiveWorld() — REQ-WIS-02, REQ-DPPMC-LENS-01.
 *
 * Asserts that cookies().set is called with the correct name and options,
 * AND that dh:role is cleared on world-switch (per-world lens, Slice C).
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
import { setActiveWorld } from './set-active-world';

describe('setActiveWorld()', () => {
  beforeEach(() => {
    mockCookiesSet.mockReset();
    mockCookiesDelete.mockReset();
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

  // REQ-DPPMC-LENS-01: clearing dh:role on world-switch (per-world lens, Slice C)
  it('LENS-01: clears dh:role cookie after writing dh:world (per-world lens)', async () => {
    await setActiveWorld('world-abc-123');

    expect(mockCookiesDelete).toHaveBeenCalledWith('dh:role');
  });

  it('LENS-01: clears dh:role AFTER the dh:world set (order check)', async () => {
    const callOrder: string[] = [];
    mockCookiesSet.mockImplementation(() => { callOrder.push('set'); });
    mockCookiesDelete.mockImplementation(() => { callOrder.push('delete'); });

    await setActiveWorld('world-abc-123');

    expect(callOrder).toEqual(['set', 'delete']);
  });
});
