// REQ-WCO-WEB-01 — Mobile-first (375px) player read view
// REQ-WCO-WEB-05 — ResourcePanel for own combatant only
// REQ-WCO-WEB-08 — Role branch: TurnBanner + ConditionBadges for players;
//                  TurnControlsIsland retained (GM and player both see encounter detail)
//
// Design D5: owner-only panel — derive owned char ids via GET /characters?status=active,
//            intersect with combatant characterIds; server-side owner-auth is real guard.
// Design D6: one page, not a new route. GM still sees TurnControlsIsland.
// Design D4: stale-state — revalidatePath after each Server Action; "Actualizar"
//            affordance triggers router.refresh() from the client.

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { Pill } from '@/components/ui/pill';
import { RadialDial } from '@/components/encuentros/radial-dial';
import { RosterList } from '@/components/encuentros/roster-row';
import { TurnControlsIsland } from '@/components/encuentros/turn-controls-island';
import { TurnBanner } from '@/components/encuentros/turn-banner';
import { ResourcePanel } from '@/components/encuentros/resource-panel';
import type { EncounterDetail } from '@/components/encuentros/types';
import type { ClassResourceView, SheetResponse } from '@/lib/sheet-types';

type RouteParams = Promise<{ id: string }>;

type CharacterListRow = { id: string };
type CharacterListResponse = { data: CharacterListRow[] };

export default async function EncuentroDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  let detail: EncounterDetail;
  try {
    detail = await api.get<EncounterDetail>(`/encounters/${id}`, token);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  // D5: Fetch own active characters to resolve which combatant belongs to this player.
  // Best-effort: on failure we assume spectator / GM (no own combatant → no ResourcePanel).
  let ownCharacterIds: Set<string> = new Set();
  try {
    const roster = await api.get<CharacterListResponse>('/characters?status=active', token);
    ownCharacterIds = new Set((roster.data ?? []).map((c) => c.id));
  } catch {
    // Treat as spectator on network failure — safe degrade
    ownCharacterIds = new Set();
  }

  // Find which combatant is owned by this player (first match on characterId).
  const ownCombatant = detail.combatants.find(
    (c) => c.characterId !== null && ownCharacterIds.has(c.characterId),
  ) ?? null;

  // If there's an own combatant, fetch their class resources for ResourcePanel.
  // Design D3 — this fetch is NOT on page.tsx today; added here per Risk #2 in tasks.
  let ownResources: ClassResourceView[] = [];
  if (ownCombatant?.characterId) {
    try {
      const sheet = await api.get<SheetResponse>(
        `/characters/${ownCombatant.characterId}/sheet`,
        token,
      );
      ownResources = Object.values(sheet.sheet.classResources ?? {});
    } catch {
      // Resource panel degrades gracefully on failure
      ownResources = [];
    }
  }

  // REQ-WCO-WEB-08: find the current combatant name for TurnBanner
  const currentCombatant = detail.combatants.find((c) => c.id === detail.currentCombatantId);
  const currentCombatantName = currentCombatant?.name ?? 'Desconocido';

  return (
    <AppShell title={detail.name} subtitle="ENCUENTRO" backHref="/encuentros">
      {/* REQ-WCO-WEB-01: single column on mobile (max-w-md); two-column enhancement on desktop */}
      <div className="max-w-md md:max-w-3xl mx-auto flex flex-col gap-4">
        {/* Status pills */}
        <div className="flex items-baseline gap-2">
          <Pill size="sm" tone="accent">Ronda {detail.round}</Pill>
          <Pill size="sm" tone={detail.status === 'active' ? 'primary' : 'stone'}>
            {detail.status === 'active' ? 'Activo' : 'Cerrado'}
          </Pill>
        </div>

        {/* RadialDial: always shown */}
        <RadialDial
          combatants={detail.combatants}
          currentCombatantId={detail.currentCombatantId}
        />

        {/* REQ-WCO-WEB-02: TurnBanner — sticky below RadialDial */}
        <TurnBanner
          currentCombatantId={detail.currentCombatantId}
          ownCombatantId={ownCombatant?.id ?? null}
          currentCombatantName={currentCombatantName}
        />

        {/* REQ-WCO-WEB-08: TurnControlsIsland for GM (advance-turn button) */}
        <TurnControlsIsland encounterId={detail.id} version={detail.version} />

        {/* REQ-WCO-WEB-03/04: RosterList with ConditionBadges + own action-economy */}
        <RosterList
          combatants={detail.combatants}
          currentCombatantId={detail.currentCombatantId}
          ownCombatantId={ownCombatant?.id ?? null}
        />

        {/* REQ-WCO-WEB-05: ResourcePanel — only when player has an own combatant */}
        {ownCombatant && (
          <section aria-label="Recursos de personaje" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
              Recursos
            </h2>
            <ResourcePanel
              characterId={ownCombatant.characterId!}
              encounterId={detail.id}
              resources={ownResources}
            />
          </section>
        )}
      </div>
    </AppShell>
  );
}
