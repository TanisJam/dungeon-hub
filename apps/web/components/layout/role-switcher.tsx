'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/lib/use-role';
import { useRole } from '@/lib/use-role';

interface RoleSwitcherProps {
  /**
   * The server's per-world effectiveView (authoritative seed). Shown as the current
   * role on SSR; reconciled from the dh:role cookie after mount. Defaults to 'player'.
   */
  defaultRole?: Role;
}

/** Read the dh:role cookie (client-only). The cookie is the server's source of truth. */
function readRoleCookie(): Role | null {
  if (typeof document === 'undefined') return null;
  const v = document.cookie
    .split('; ')
    .find((c) => c.startsWith('dh:role='))
    ?.split('=')[1];
  return v === 'dm' || v === 'player' ? v : null;
}

/**
 * RoleSwitcher — a single compact button showing the CURRENT view (DM / PJ) with a
 * swap glyph. Tap to toggle to the other role.
 *
 * Display is server-authoritative: SSR uses `defaultRole` (the page's effectiveView),
 * then reconciles from the dh:role cookie after mount (NOT stale localStorage). Toggling
 * flips local state immediately (round-trips), and `setRole` dual-writes the cookie +
 * localStorage + sync event so server pages re-render and client affordances react.
 */
export function RoleSwitcher({ defaultRole = 'player' }: RoleSwitcherProps) {
  const [, setRole] = useRole(defaultRole);
  const router = useRouter();
  const [role, setLocal] = useState<Role>(defaultRole);

  useEffect(() => {
    setLocal(readRoleCookie() ?? defaultRole);
  }, [defaultRole]);

  const toggle = () => {
    const next: Role = role === 'dm' ? 'player' : 'dm';
    setLocal(next);
    setRole(next);
    router.refresh();
  };

  const label = role === 'dm' ? 'DM' : 'PJ';
  const tone =
    role === 'dm'
      ? 'border-secondary/45 text-secondary bg-secondary-soft/60'
      : 'border-accent/45 text-accent bg-accent-soft/60';

  return (
    <button
      type="button"
      data-value={role}
      aria-pressed={role === 'dm'}
      onClick={toggle}
      title="Cambiar vista DM / Jugador"
      aria-label={`Vista actual: ${label}. Tocar para cambiar.`}
      className={`inline-flex items-center gap-1 rounded-pill border px-2 py-[3px] font-sans text-[9px] font-bold uppercase tracking-[0.08em] transition-colors hover:brightness-110 active:translate-y-px ${tone}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 9h13M14 6l3 3-3 3" />
        <path d="M20 15H7M10 12l-3 3 3 3" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
