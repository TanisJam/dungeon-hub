'use client';

import { useEffect, useState } from 'react';

export type Role = 'player' | 'dm';

const STORAGE_KEY = 'dh:role';
const EVENT_NAME = 'dh:role-change';

function readStored(): Role {
  if (typeof window === 'undefined') return 'player';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'dm' ? 'dm' : 'player';
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
    window.dispatchEvent(new CustomEvent<Role>(EVENT_NAME, { detail: next }));
  };

  return [role, setRole];
}
