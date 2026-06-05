'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/lib/use-role';
import { useRole } from '@/lib/use-role';
import { ToggleChip } from '@/components/ui/toggle-chip';

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

  return (
    <ToggleChip
      tone={role === 'dm' ? 'secondary' : 'accent'}
      active
      onClick={toggle}
      ariaPressed={role === 'dm'}
      ariaLabel={`Vista actual: ${label}. Tocar para cambiar.`}
      title="Cambiar vista DM / Jugador"
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
    </ToggleChip>
  );
}
