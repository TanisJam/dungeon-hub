import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getActiveWorld } from '@/lib/active-world';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { PlayerCodexGrid } from '@/app/codex/_components/player-codex-grid';
import { CODEX_DM_SUBNAV_ITEMS } from '@/app/codex/_components/codex-subnav-items';

/**
 * Compendio — Server Component.
 *
 * DM-reachable route surfacing PlayerCodexGrid (8 category nav links).
 * No DM redirect — this route is intentionally accessible from DM view.
 * REQ-DPPMD-CODEX-01, REQ-DPPMD-CODEX-04, ADR-D3.
 */
export default async function CompendioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const aw = await getActiveWorld(token);

  // Canonical effectiveView formula (REQ-WIS-08)
  const callerRole = aw?.callerRole ?? null;
  const worldSwitcher = token ? (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={callerRole}
    />
  ) : undefined;

  return (
    <AppShell
      title="Codex"
      subtitle="COMPENDIO"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={CODEX_DM_SUBNAV_ITEMS} activePath="/codex/compendio" />
      <PlayerCodexGrid />
    </AppShell>
  );
}
