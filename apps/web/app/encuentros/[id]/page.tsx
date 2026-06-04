// REQ-WCO-WEB-01 — Mobile-first (375px) read view (GM and player)
// REQ-WCO-WEB-05 — ResourcePanel for own combatant only
// REQ-WCO-WEB-07 — "Actualizar" refresh affordance (RefreshButton client island)
// REQ-WCO-WEB-08 — Role gate: TurnControlsIsland is shown only to 'gm' callers.
//                  Players see TurnBanner + ConditionBadges but NOT the advance-turn button.
//                  Gate is driven by detail.callerRole returned from GET /encounters/:id.
//
// Design D5: owner-only panel — derive owned char ids via GET /characters?status=active,
//            intersect with combatant characterIds; server-side owner-auth is real guard.
// Design D6: one page, not a new route.
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
import { RefreshButton } from '@/components/encuentros/refresh-button';
import { ResourcePanel } from '@/components/encuentros/resource-panel';
import { RageControls } from '@/components/encuentros/rage-controls';
import { PlayerActionPanel } from '@/components/encuentros/player-action-panel';
import { PassTurnButton } from '@/components/encuentros/pass-turn-button';
import { AttackSheet } from '@/components/encuentros/attack-sheet';
import type { EncounterDetail } from '@/components/encuentros/types';
import type { ClassResourceView, SheetResponse, EnrichedInventoryItem } from '@/lib/sheet-types';

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
  // Single-PC assumption: if a player owns 2 PCs in the same encounter, only the first
  // one in initiative order gets a ResourcePanel. Multi-PC-per-encounter is intentionally
  // out of scope for this feature; the server enforces the real ownership gate.
  const ownCombatant = detail.combatants.find(
    (c) => c.characterId !== null && ownCharacterIds.has(c.characterId),
  ) ?? null;

  // If there's an own combatant, fetch their class resources for ResourcePanel + RageControls.
  // Design D3 — this fetch is NOT on page.tsx today; added here per Risk #2 in tasks.
  // ADR-4 (C2): also retain inventoryEnriched for AttackSheet island — no new API call.
  let ownResources: ClassResourceView[] = [];
  let ownClassResources: Record<string, ClassResourceView> = {};
  let ownInventoryEnriched: EnrichedInventoryItem[] = [];
  if (ownCombatant?.characterId) {
    try {
      const sheet = await api.get<SheetResponse>(
        `/characters/${ownCombatant.characterId}/sheet`,
        token,
      );
      ownClassResources = sheet.sheet.classResources ?? {};
      ownResources = Object.values(ownClassResources);
      // ADR-4: retain inventoryEnriched from same fetch (additive field, optional).
      // This avoids a second API call — the weapon list for AttackSheet comes from here.
      ownInventoryEnriched = sheet.inventoryEnriched ?? [];
    } catch {
      // Resource panel degrades gracefully on failure
      ownResources = [];
      ownClassResources = {};
      ownInventoryEnriched = [];
    }
  }

  // REQ-WCR-WEB-PAGE-01 — Derive Barbarian/Rage state from already-fetched data.
  // isBarbarian: slug 'barbarian:rage-uses' present in classResources (PHB p.48).
  const rageResource = ownClassResources['barbarian:rage-uses'] ?? null;
  const isBarbarian = rageResource !== null;
  // rageUnlimited: sentinel max=999 means Unlimited at L20 (PHB p.48 rage uses table).
  const rageUnlimited = isBarbarian && rageResource!.max === 999;
  const rageUsesRemaining = isBarbarian ? rageResource!.max - rageResource!.used : 0;
  const rageMax = isBarbarian ? rageResource!.max : 0;
  // isRaging: 'Raging' condition on own combatant (PHB p.48 — Rage condition).
  const isRaging = ownCombatant?.conditions.some((c) => c.name === 'Raging') ?? false;
  // isOwnTurn: current combatant matches own combatant.
  const isOwnTurn = ownCombatant != null && detail.currentCombatantId === ownCombatant.id;
  // bonusActionUsed: from action economy on own combatant.
  const bonusActionUsed = ownCombatant?.bonusActionUsed ?? false;
  // actionUsed: from action economy on own combatant.
  const actionUsed = ownCombatant?.actionUsed ?? false;

  // ADR-4 (C2): derive weapon + target lists for AttackSheet island.
  // equippedWeapons: v3Type==='weapon' && equipped (from same sheet fetch — no new call).
  const equippedWeapons = ownInventoryEnriched.filter(
    (i) => i.v3Type === 'weapon' && i.equipped,
  );
  // npcTargets: characterId===null (NPC), alive (hpCurrent>0), not the attacker.
  const npcTargets = detail.combatants.filter(
    (c) => c.characterId === null && c.hpCurrent > 0 && c.id !== ownCombatant?.id,
  );

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

        {/* REQ-WCO-WEB-07: Refresh affordance — lets player pull latest state without reload */}
        <div className="flex justify-end">
          <RefreshButton />
        </div>

        {/* REQ-WCO-WEB-08: TurnControlsIsland is GM-only; players do NOT see the advance-turn button.
            Gate is callerRole from GET /encounters/:id — 'gm' | 'player'. */}
        {detail.callerRole === 'gm' && (
          <TurnControlsIsland encounterId={detail.id} version={detail.version} />
        )}

        {/* REQ-WCO-WEB-03/04: RosterList with ConditionBadges + own action-economy */}
        <RosterList
          combatants={detail.combatants}
          currentCombatantId={detail.currentCombatantId}
          ownCombatantId={ownCombatant?.id ?? null}
        />

        {/* REQ-WCR-WEB-PAGE-01: RageControls — only for own Barbarian combatant.
            Placed ABOVE Recursos per ADR-4 (mobile-first 375px: Rage is the headline action). */}
        {ownCombatant && isBarbarian && (
          <section aria-label="Furia" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
              Furia
            </h2>
            <RageControls
              combatantId={ownCombatant.id}
              encounterId={detail.id}
              isRaging={isRaging}
              isOwnTurn={isOwnTurn}
              bonusActionUsed={bonusActionUsed}
              rageUsesRemaining={rageUsesRemaining}
              rageMax={rageMax}
              rageUnlimited={rageUnlimited}
              version={detail.version}
            />
          </section>
        )}

        {/* REQ-WCPT-WEB-UI-01: PlayerActionPanel — only on own turn in active encounter.
            Placed BELOW Rage section, ABOVE Recursos — turn-level actions (ADR-5).
            REQ-WCA-WEB-UI-01 (C2): AttackSheet rendered as sibling to PassTurnButton —
            zero edits to PlayerActionPanel (ADR-3). Gated on own turn + active + weapons exist. */}
        {ownCombatant != null && isOwnTurn && detail.status === 'active' && (
          <PlayerActionPanel>
            <PassTurnButton
              encounterId={detail.id}
              combatantId={ownCombatant.id}
              version={detail.version}
              isOwnTurn={isOwnTurn}
            />
            {equippedWeapons.length > 0 && npcTargets.length > 0 && (
              <AttackSheet
                encounterId={detail.id}
                attackerCombatantId={ownCombatant.id}
                equippedWeapons={equippedWeapons}
                npcTargets={npcTargets}
                version={detail.version}
                isOwnTurn={isOwnTurn}
                actionUsed={actionUsed}
              />
            )}
          </PlayerActionPanel>
        )}

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
