/**
 * Tests for useRole() client hook — dual-write + hydration
 *
 * REQ-RD-DUAL-WRITE-05: setRole writes both cookie (dh:role) and localStorage atomically
 * REQ-RD-HYDRATE-FROM-COOKIE-06: on mount, hydrates from cookie if localStorage is missing
 * REQ-RD-COOKIE-ATTRS-03: cookie written with path=/, SameSite=Lax
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRole } from './use-role';

// Helper to read a specific cookie from document.cookie string
function getCookieValue(name: string): string | undefined {
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.split('=')[1] : undefined;
}

describe('useRole() dual-write + hydration', () => {
  beforeEach(() => {
    // Clear cookie and localStorage between tests (jsdom does NOT auto-clear)
    document.cookie = 'dh:role=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    localStorage.clear();
  });

  it('setRole("dm") writes to both localStorage and document.cookie', () => {
    // REQ-RD-DUAL-WRITE-05: Scenario: dual write on toggle
    const { result } = renderHook(() => useRole());
    const [, setRole] = result.current;

    act(() => {
      setRole('dm');
    });

    expect(localStorage.getItem('dh:role')).toBe('dm');
    expect(getCookieValue('dh:role')).toBe('dm');
  });

  it('mounts with role "dm" when localStorage is missing but cookie has dh:role=dm', () => {
    // REQ-RD-HYDRATE-FROM-COOKIE-06: Scenario: hydrate from cookie when localStorage empty
    // Seed cookie before mounting
    document.cookie = 'dh:role=dm; path=/; SameSite=Lax';

    const { result } = renderHook(() => useRole());

    // After mount effect fires, role should be hydrated from cookie
    expect(result.current[0]).toBe('dm');
  });

  it('prefers localStorage over cookie when both are present', () => {
    // REQ-RD-HYDRATE-FROM-COOKIE-06: Scenario: localStorage takes precedence when both present
    localStorage.setItem('dh:role', 'player');
    document.cookie = 'dh:role=dm; path=/; SameSite=Lax';

    const { result } = renderHook(() => useRole());

    expect(result.current[0]).toBe('player');
  });
});
