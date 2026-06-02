import { WorldSwitcher } from '@/components/layout/world-switcher';
import { getMyWorlds } from '@/lib/api';
import type { CallerRole } from '@/lib/active-world';

interface WorldSwitcherShellProps {
  token: string;
  activeWorldId: string | null;
  callerRole: CallerRole;
}

/**
 * WorldSwitcherShell — Server Component that delivers world list to WorldSwitcher.
 *
 * ADR-4: Server-props delivery pattern. Calls getMyWorlds(token) server-side and
 * passes worlds + activeWorldId + callerRole to the 'use client' WorldSwitcher.
 * One roundtrip, already in the page's request context.
 */
export async function WorldSwitcherShell({
  token,
  activeWorldId,
  callerRole,
}: WorldSwitcherShellProps) {
  const worlds = await getMyWorlds(token).catch(() => []);

  return (
    <WorldSwitcher
      worlds={worlds}
      activeWorldId={activeWorldId}
      callerRole={callerRole}
    />
  );
}
