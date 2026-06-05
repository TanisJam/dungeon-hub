'use client';

/**
 * FactionChipSectionIsland — catalog demo of FactionChipSection.
 *
 * FactionChipSection renders N:M faction membership chips for an NPC. DM view:
 * chips have × (detach) buttons + "+" picker to attach new factions. Player view:
 * read-only chips only. Stubs simulate ~300ms async round-trips.
 *
 * INTERACTIVE — detach/attach run stubs and log confirmation. The picker opens
 * on "+" tap and lists unattached factions. Changes are reflected locally.
 */

import { useState } from 'react';
import { FactionChipSection } from '@/components/world/npcs/faction-chip-section';
import type { NpcFaction, FactionRow, FactionState } from '@/app/codex/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORLD_FACTIONS: FactionRow[] = [
  {
    id: 'fac-vistani',
    worldId: 'world-barovia',
    name: 'Los Vistani',
    state: 'active' as FactionState,
    description: 'Pueblo nómade con lazos misteriosos con Strahd.',
    dmNotes: null,
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-10-20T00:00:00.000Z',
  },
  {
    id: 'fac-corte',
    worldId: 'world-barovia',
    name: 'Corte de Ravenloft',
    state: 'active' as FactionState,
    description: 'Los sirvientes de Strahd en el castillo.',
    dmNotes: null,
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-11-01T00:00:00.000Z',
  },
  {
    id: 'fac-orden',
    worldId: 'world-barovia',
    name: 'Orden del Dragón de Plata',
    state: 'dormant' as FactionState,
    description: 'Antigua orden paladínica que alguna vez protegió Barovia.',
    dmNotes: null,
    createdAt: '2024-09-05T00:00:00.000Z',
    updatedAt: '2024-10-10T00:00:00.000Z',
  },
];

const INITIAL_FACTIONS: NpcFaction[] = [
  {
    id: 'fac-corte',
    worldId: 'world-barovia',
    name: 'Corte de Ravenloft',
    state: 'active' as FactionState,
    description: null,
  },
];

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function FactionChipSectionIsland() {
  const [factions, setFactions] = useState<NpcFaction[]>(INITIAL_FACTIONS);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const onAttach = async (factionId: string) => {
    await new Promise((r) => setTimeout(r, 300));
    const faction = WORLD_FACTIONS.find((f) => f.id === factionId);
    if (faction) {
      setFactions((prev) => [
        ...prev,
        { id: faction.id, worldId: faction.worldId, name: faction.name, state: faction.state, description: faction.description ?? null },
      ]);
      setLastAction(`(Catalog) onAttach stub → "${faction.name}" attached`);
      setTimeout(() => setLastAction(null), 2000);
    }
    return { ok: true };
  };

  const onDetach = async (factionId: string) => {
    await new Promise((r) => setTimeout(r, 300));
    const name = factions.find((f) => f.id === factionId)?.name ?? factionId;
    setFactions((prev) => prev.filter((f) => f.id !== factionId));
    setLastAction(`(Catalog) onDetach stub → "${name}" detached`);
    setTimeout(() => setLastAction(null), 2000);
    return { ok: true };
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-ink-mute font-mono">
        DM view — detach chips with ×, attach via "+" picker. Changes reflected locally (stubs).
      </p>
      <div className="border border-line rounded-md bg-paper p-4" style={{ maxWidth: 375 }}>
        <FactionChipSection
          factions={factions}
          worldFactions={WORLD_FACTIONS}
          effectiveView="dm"
          onAttach={onAttach}
          onDetach={onDetach}
        />
      </div>
      {lastAction && (
        <p className="text-[10px] text-primary-deep font-mono text-center">{lastAction}</p>
      )}
    </div>
  );
}
