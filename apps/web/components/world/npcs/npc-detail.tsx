'use client';

// NpcDetail — renders NPC detail content inside V3Sheet.
// REQ-NPC-01, REQ-GATE-01: DM view includes dmNotes + faction chip controls; player view omits them.
// REQ-NPC-02: faction chip list is managed as local state; re-fetched via getNpcDetail after attach/detach.
//
// NOTE: This is a 'use client' component because it manages local chip state (useState).
// It is rendered inside WorldEntityShell's renderDetail slot, which is already in a client context.

import { useState } from 'react';
import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import type { NpcRow, NpcFaction, NpcStatus, FactionRow } from '@/app/codex/actions';
import { getNpcDetail, attachNpcFaction, detachNpcFaction } from '@/app/codex/actions';
import { FactionChipSection } from './faction-chip-section';

interface NpcDetailProps {
  detail: NpcRow;
  effectiveView: EffectiveView;
  worldId: string;
  worldFactions: FactionRow[];
}

const STATUS_LABELS: Record<NpcStatus, string> = {
  alive: 'Vivo',
  dead: 'Muerto',
  missing: 'Desaparecido',
  unknown: 'Desconocido',
};

const STATUS_TONES: Record<NpcStatus, PillTone> = {
  alive: 'primary',
  dead: 'ink',
  missing: 'amber',
  unknown: 'stone',
};

export function NpcDetailView({ detail, effectiveView, worldId, worldFactions }: NpcDetailProps) {
  // REQ-NPC-02: manage faction chip list as local state; re-fetch after attach/detach (no stale chips).
  const [factions, setFactions] = useState<NpcFaction[]>(detail.factions);

  async function handleAttach(factionId: string): Promise<{ ok: boolean; error?: string }> {
    const result = await attachNpcFaction(worldId, detail.id, factionId);
    if (result.ok) {
      // Re-fetch full NPC detail to get fresh faction list
      const refreshed = await getNpcDetail(detail.id);
      if (refreshed) setFactions(refreshed.factions);
    }
    return result.ok
      ? { ok: true }
      : { ok: false, error: (result as { error: string }).error };
  }

  async function handleDetach(factionId: string): Promise<{ ok: boolean; error?: string }> {
    const result = await detachNpcFaction(worldId, detail.id, factionId);
    if (result.ok) {
      // Re-fetch full NPC detail to get fresh faction list
      const refreshed = await getNpcDetail(detail.id);
      if (refreshed) setFactions(refreshed.factions);
    }
    return result.ok
      ? { ok: true }
      : { ok: false, error: (result as { error: string }).error };
  }

  return (
    <div className="space-y-4">
      {/* Name + Status */}
      <div className="flex items-center gap-3">
        <h3 className="flex-1 font-display text-xl text-ink">{detail.name}</h3>
        <Pill tone={STATUS_TONES[detail.status]} size="md">
          {STATUS_LABELS[detail.status]}
        </Pill>
      </div>

      {/* Race */}
      {detail.race && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Raza
          </p>
          <p className="text-sm text-ink">{detail.race}</p>
        </div>
      )}

      {/* Description */}
      {detail.description && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Descripción
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-ink">
            {detail.description}
          </p>
        </div>
      )}

      {/* dmNotes — DM view only (REQ-GATE-01: absence, not disable) */}
      {effectiveView === 'dm' && detail.dmNotes && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Notas del DM
          </p>
          <p className="whitespace-pre-wrap break-words rounded-md bg-paper-soft p-3 text-sm text-ink">
            {detail.dmNotes}
          </p>
        </div>
      )}

      {/* Faction chip section — REQ-NPC-02 */}
      <FactionChipSection
        factions={factions}
        worldFactions={worldFactions}
        effectiveView={effectiveView}
        onAttach={handleAttach}
        onDetach={handleDetach}
      />
    </div>
  );
}
