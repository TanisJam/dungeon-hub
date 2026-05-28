'use client';

import { useEffect, useState } from 'react';

export type Role = 'player' | 'dm';

const STORAGE_KEY = 'dh:role';
const COOKIE_NAME = 'dh:role';
const EVENT_NAME = 'dh:role-change';

/** Read the dh:role cookie from document.cookie (client-side only). */
function readCookie(): Role | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return undefined;
  const value = match.split('=')[1];
  return value === 'dm' ? 'dm' : value === 'player' ? 'player' : undefined;
}

/** Write the dh:role cookie client-side. REQ-RD-COOKIE-ATTRS-03 */
function writeCookie(value: Role): void {
  document.cookie = `${COOKIE_NAME}=${value}; path=/; SameSite=Lax`;
}

function readStored(): Role {
  if (typeof window === 'undefined') return 'player';
  try {
    const ls = window.localStorage.getItem(STORAGE_KEY);
    if (ls === 'dm' || ls === 'player') return ls;
    // localStorage missing — try hydrating from cookie (REQ-RD-HYDRATE-FROM-COOKIE-06)
    const ck = readCookie();
    if (ck) {
      window.localStorage.setItem(STORAGE_KEY, ck);
      return ck;
    }
    return 'player';
  } catch {
    return 'player';
  }
}

/**
 * useRole — client-side role state synced across components via localStorage + a
 * window event. Returns [role, setRole]. SSR renders 'player'; the client hydrates
 * to the stored value on mount.
 */
export function useRole(): [Role, (next: Role) => void] {
  const [role, setRoleState] = useState<Role>('player');

  useEffect(() => {
    setRoleState(readStored());
    function onChange(e: Event) {
      const detail = (e as CustomEvent<Role>).detail;
      if (detail === 'player' || detail === 'dm') setRoleState(detail);
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const setRole = (next: Role) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / privacy mode errors */
    }
    // Dual-write: keep cookie in sync so SSR reads the correct role on next request
    // REQ-RD-DUAL-WRITE-05
    writeCookie(next);
    window.dispatchEvent(new CustomEvent<Role>(EVENT_NAME, { detail: next }));
  };

  return [role, setRole];
}
