/**
 * Tests for getRole() server utility
 *
 * REQ-RD-COOKIE-VALUES-02: valid dm value, unknown value defaults to player, missing cookie defaults to player
 * REQ-RD-SERVER-UTIL-04: getRole() returns 'player' | 'dm' from next/headers cookies()
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable getter so each test can override the cookie value
let mockCookieValue: { value: string } | undefined = undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (k === 'dh:role' ? mockCookieValue : undefined),
  }),
}));

import { getRole } from './role';

describe('getRole()', () => {
  beforeEach(() => {
    mockCookieValue = undefined;
  });

  it('returns "dm" when cookie dh:role has value "dm"', async () => {
    // REQ-RD-COOKIE-VALUES-02: Scenario: valid dm value
    mockCookieValue = { value: 'dm' };
    expect(await getRole()).toBe('dm');
  });

  it('returns "player" when cookie is missing (get returns undefined)', async () => {
    // REQ-RD-COOKIE-VALUES-02: Scenario: missing cookie defaults to player
    mockCookieValue = undefined;
    expect(await getRole()).toBe('player');
  });

  it('returns "player" when cookie value is "superadmin" (invalid value)', async () => {
    // REQ-RD-COOKIE-VALUES-02: Scenario: unknown value defaults to player
    mockCookieValue = { value: 'superadmin' };
    expect(await getRole()).toBe('player');
  });
});
