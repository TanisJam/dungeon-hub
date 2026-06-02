'use client';

import { RoleSwitcher } from '@/components/layout/role-switcher';

/**
 * Dev-only client island wrapper for RoleSwitcher.
 * Re-exports the real component so the registry (a server module) can include
 * it as a ReactNode without importing a client component directly.
 */
export function RoleSwitcherIsland() {
  return <RoleSwitcher defaultRole="player" />;
}
