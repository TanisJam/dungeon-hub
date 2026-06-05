import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { JournalClientWrapper } from '@/components/world/journal/journal-client-wrapper';
import { V3Empty } from '@/components/ui';
import type { JournalRow } from '../actions';

/**
 * Notas — Server Component.
 *
 * Resolves active world + view preference in parallel (REQ-CRO-03).
 * Computes effectiveView from callerRole (world authority) and dh:role cookie overlay.
 * SSR-fetches initial journal entries; renders SubNav + JournalClientWrapper.
 * REQ-CRO-01, REQ-CRO-03.
 */
export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const { tag } = await searchParams;

  // REQ-CRO-03: resolve active world + view preference in parallel
  const [aw, viewPref] = await Promise.all([getActiveWorld(token), getViewPreference()]);

  // Canonical effectiveView formula (REQ-WIS-08)
  const effectiveView =
    aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  const callerRole = aw?.callerRole ?? null;
  const worldSwitcher = token ? (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={callerRole}
    />
  ) : undefined;

  const subNavItems = [
    { label: 'Eventos', href: '/cronica/eventos' },
    { label: 'Notas', href: '/cronica/notas' },
  ];

  // REQ-CRO-03 Scenario: No active world — render empty state (no 500)
  if (!aw) {
    return (
      <AppShell
        title="Bitácora"
        subtitle="NOTAS"
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <SubNav items={subNavItems} activePath="/cronica/notas" />
        <V3Empty
          glyph="scroll"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para ver las notas."
        />
      </AppShell>
    );
  }

  // SSR initial journal entries list
  let initialEntries: JournalRow[] = [];
  try {
    const params = new URLSearchParams({ limit: '50', offset: '0' });
    if (tag) params.set('tag', tag);
    const res = await api.get<{ data: JournalRow[] }>(
      `/worlds/${aw.id}/journal-entries?${params.toString()}`,
      token,
    );
    initialEntries = res.data ?? [];
  } catch {
    // If fetch fails, render with empty list — client can retry via search
  }

  return (
    <AppShell
      title="Bitácora"
      subtitle="NOTAS"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={subNavItems} activePath="/cronica/notas" />
      <JournalClientWrapper
        worldId={aw.id}
        effectiveView={effectiveView}
        initialEntries={initialEntries}
        initialTag={tag}
      />
    </AppShell>
  );
}
