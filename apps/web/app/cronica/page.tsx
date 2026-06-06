import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { CronicaFeed } from '@/components/world/cronica/cronica-feed';
import { V3Empty } from '@/components/ui';
import type { FeedItem } from './actions';

/**
 * Crónica — unified Bitácora del Gremio feed (bitacora-gremio W4).
 *
 * REQ-GREM-FD-01, REQ-GREM-FD-04, REQ-GREM-FD-05.
 * ADR-4: /cronica IS the unified feed. No longer redirects to /cronica/eventos.
 *
 * SSR-fetches initial cronica-feed items; renders TagFilter + FeedCard stack.
 * Eventos and Notas are now source-facets accessible via SubNav (deep-links preserved).
 */
export default async function CronicaPage({
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

  // 3-item SubNav — Todo (all sources) | Eventos | Notas (ADR-4)
  const subNavItems = [
    { label: 'Todo', href: '/cronica' },
    { label: 'Eventos', href: '/cronica/eventos' },
    { label: 'Notas', href: '/cronica/notas' },
  ];

  // No active world → empty state (no 500)
  if (!aw) {
    return (
      <AppShell
        title="Bitácora"
        subtitle="GREMIO"
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <SubNav items={subNavItems} activePath="/cronica" />
        <V3Empty
          glyph="scroll"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para ver la bitácora del gremio."
        />
      </AppShell>
    );
  }

  // SSR initial feed items
  let initialItems: FeedItem[] = [];
  let initialNextOffset: number | null = null;
  try {
    const params = new URLSearchParams({ limit: '50', offset: '0' });
    if (tag) params.set('tag', tag);
    const res = await api.get<{ rows: FeedItem[]; total: number; nextOffset: number | null }>(
      `/worlds/${aw.id}/cronica-feed?${params.toString()}`,
      token,
    );
    initialItems = res.rows ?? [];
    initialNextOffset = res.nextOffset ?? null;
  } catch {
    // Render with empty list — CronicaFeed handles empty state
  }

  return (
    <AppShell
      title="Bitácora"
      subtitle="TODO"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={subNavItems} activePath="/cronica" />
      <CronicaFeed
        worldId={aw.id}
        initialItems={initialItems}
        initialTag={tag}
        initialNextOffset={initialNextOffset}
        effectiveView={effectiveView}
      />
    </AppShell>
  );
}
