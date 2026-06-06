import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { JournalClientWrapper } from '@/components/world/journal/journal-client-wrapper';
import { CronicaFeed } from '@/components/world/cronica/cronica-feed';
import { V3Empty } from '@/components/ui';
import type { JournalRow, FeedItem } from '../actions';

/**
 * Notas — source-facet of the unified Bitácora del Gremio (bitacora-gremio W4).
 *
 * REQ-GREM-FD-04, ADR-4, ADR-7.
 * Deep-link preserved: /cronica/notas still resolves (now as a facet).
 * JournalClientWrapper RETAINED: DM create/edit/delete affordances must not be lost (T-12 check).
 * CronicaFeed added with source="dm" — unified tag filter applies to journal_entries only.
 *
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

  // 3-item SubNav — Todo | Eventos | Notas (active) (ADR-4)
  const subNavItems = [
    { label: 'Todo', href: '/cronica' },
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

  // SSR initial journal entries via JournalClientWrapper (DM create affordance) — legacy data fetch
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
    // Render with empty list
  }

  // SSR initial cronica-feed items for the unified feed facet
  let initialFeedItems: FeedItem[] = [];
  let initialNextOffset: number | null = null;
  try {
    const params = new URLSearchParams({ limit: '50', offset: '0', source: 'dm' });
    if (tag) params.set('tag', tag);
    const res = await api.get<{ rows: FeedItem[]; total: number; nextOffset: number | null }>(
      `/worlds/${aw.id}/cronica-feed?${params.toString()}`,
      token,
    );
    initialFeedItems = res.rows ?? [];
    initialNextOffset = res.nextOffset ?? null;
  } catch {
    // Use entries-derived initial items as fallback
  }

  return (
    <AppShell
      title="Bitácora"
      subtitle="NOTAS"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={subNavItems} activePath="/cronica/notas" />
      {/* JournalClientWrapper: DM CRUD affordances (create/edit/delete) — MUST NOT be removed (ADR-7, T-12) */}
      <JournalClientWrapper
        worldId={aw.id}
        effectiveView={effectiveView}
        initialEntries={initialEntries}
        initialTag={tag}
      />
      {/* CronicaFeed source-facet: unified tag filter + FeedCard layout for notas */}
      <CronicaFeed
        worldId={aw.id}
        source="dm"
        initialItems={initialFeedItems}
        initialTag={tag}
        initialNextOffset={initialNextOffset}
        effectiveView={effectiveView}
      />
    </AppShell>
  );
}
