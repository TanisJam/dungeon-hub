import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { QuestClientWrapper } from '@/components/world/quests/quest-client-wrapper';
import { V3Empty } from '@/components/ui';
import type { QuestRow } from './actions';

/**
 * Quests — Server Component.
 *
 * Resolves active world + view preference in parallel (REQ-QUEST-WEB-PAGE-01).
 * Computes effectiveView from callerRole (world authority) and dh:role cookie overlay.
 * SSR-fetches initial quest list; renders SubNav + QuestClientWrapper.
 * REQ-QUEST-WEB-PAGE-01, REQ-QUEST-WEB-PAGE-02.
 */
export default async function QuestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // REQ-QUEST-WEB-PAGE-01: resolve active world + view preference in parallel
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
    { label: 'Facciones', href: '/codex/facciones' },
    { label: 'NPCs', href: '/codex/npcs' },
    { label: 'Quests', href: '/codex/quests' },
  ];

  // REQ-QUEST-WEB-PAGE-01 Scenario: No active world — render empty state (no 500)
  if (!aw) {
    return (
      <AppShell
        title="Codex"
        subtitle="QUESTS"
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <SubNav items={subNavItems} activePath="/codex/quests" />
        <V3Empty
          glyph="book"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para ver las quests."
        />
      </AppShell>
    );
  }

  // SSR initial quest list
  let initialQuests: QuestRow[] = [];
  try {
    const res = await api.get<{ data: QuestRow[] }>(
      `/worlds/${aw.id}/quests`,
      token,
    );
    initialQuests = res.data ?? [];
  } catch {
    // If fetch fails, render with empty list — client can retry via search
  }

  return (
    <AppShell
      title="Codex"
      subtitle="QUESTS"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={subNavItems} activePath="/codex/quests" />
      <QuestClientWrapper
        worldId={aw.id}
        effectiveView={effectiveView}
        initialQuests={initialQuests}
      />
    </AppShell>
  );
}
