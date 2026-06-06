'use client';

/**
 * WorldEntityShellIsland — catalog demo of the generic WorldEntityShell.
 *
 * WorldEntityShell is the generic client wrapper that powers every world-entity
 * list: search, lazy detail sheet, DM FAB, edit/delete. Here we wire it up with
 * fixture NPC rows, stub async callbacks, and a presentational detail renderer
 * so the catalog shows the full DM experience — no network, no auth.
 *
 * INTERACTIVE — search filters the fixture list (client-only), tapping a row
 * opens the detail sheet, and the DM FAB opens the create form sheet.
 * All mutations are stubs (~300ms) and report "(Catalog) stub — no real server action".
 */

import { useState } from 'react';
import { WorldEntityShell } from '@/components/world/_shell/world-entity-shell';
import type { WorldEntityShellProps } from '@/components/world/_shell/world-entity-shell';
import { NpcRowView } from '@/components/world/npcs/npc-row';
import { NpcForm } from '@/components/world/npcs/npc-form';
import type { NpcRow, NpcBody, NpcStatus } from '@/app/herramientas/actions';
import type { FactionState } from '@/app/herramientas/actions';

// ---------------------------------------------------------------------------
// Fixture data — Barovia NPCs
// ---------------------------------------------------------------------------

const FIXTURE_NPCS: NpcRow[] = [
  {
    id: 'npc-strahd',
    worldId: 'world-barovia',
    name: 'Strahd von Zarovich',
    race: 'Vampiro',
    description: 'El Señor Oscuro de Barovia. Un vampiro antiguo de poder incalculable.',
    dmNotes: 'Está enamorado de Ireena Kolyana. Manipulará al grupo para acercarse a ella.',
    hexId: 'hex-ravenloft',
    status: 'alive' as NpcStatus,
    worldX: 512,
    worldY: 256,
    factions: [
      {
        id: 'fac-corte',
        worldId: 'world-barovia',
        name: 'Corte de Ravenloft',
        state: 'active' as FactionState,
        description: null,
      },
    ],
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-11-01T00:00:00.000Z',
  },
  {
    id: 'npc-ireena',
    worldId: 'world-barovia',
    name: 'Ireena Kolyana',
    race: 'Humano',
    description: 'Hija adoptiva del burgomaestre de Barovia. Cargada por la maldición de Strahd.',
    dmNotes: 'Es la reencarnación de Tatyana. Strahd la perseguirá.',
    hexId: 'hex-barovia-village',
    status: 'alive' as NpcStatus,
    worldX: null,
    worldY: null,
    factions: [],
    createdAt: '2024-09-02T00:00:00.000Z',
    updatedAt: '2024-09-15T00:00:00.000Z',
  },
  {
    id: 'npc-kolyan',
    worldId: 'world-barovia',
    name: 'Kolyan Indirovich',
    race: 'Humano',
    description: 'Burgomaestre de Barovia. Murió a causa de la maldición de Strahd.',
    dmNotes: null,
    hexId: 'hex-barovia-village',
    status: 'dead' as NpcStatus,
    worldX: null,
    worldY: null,
    factions: [],
    createdAt: '2024-09-02T00:00:00.000Z',
    updatedAt: '2024-09-15T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Island — DM view with full interactive shell
// ---------------------------------------------------------------------------

export function WorldEntityShellIsland() {
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Stub search — filters fixture list client-side, simulates async
  const onSearch = async (q: string, _offset: number) => {
    await new Promise((r) => setTimeout(r, 200));
    const lower = q.toLowerCase();
    const rows = FIXTURE_NPCS.filter(
      (n) =>
        n.name.toLowerCase().includes(lower) ||
        (n.race ?? '').toLowerCase().includes(lower),
    );
    return { rows, total: rows.length };
  };

  // Stub detail load — returns the fixture row after a short delay
  const onLoadDetail = async (row: NpcRow) => {
    await new Promise((r) => setTimeout(r, 300));
    return row;
  };

  // Stub delete
  const onDelete = async (row: NpcRow) => {
    await new Promise((r) => setTimeout(r, 300));
    setLastAction(`(Catalog) onDelete stub → "${row.name}" not actually deleted`);
    setTimeout(() => setLastAction(null), 2000);
  };

  const props: WorldEntityShellProps<NpcRow, NpcRow> = {
    items: FIXTURE_NPCS,
    total: FIXTURE_NPCS.length,
    effectiveView: 'dm',
    searchPlaceholder: 'Buscar PNJs…',
    onSearch,
    onLoadDetail,
    renderRow: (row) => <NpcRowView row={row} />,
    renderDetail: (detail) => (
      <div className="space-y-3 p-1">
        <h3 className="text-base font-semibold text-ink">{detail.name}</h3>
        {detail.race && <p className="text-xs text-ink-soft">{detail.race}</p>}
        {detail.description && <p className="text-sm text-ink">{detail.description}</p>}
        {detail.dmNotes && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">DM Notes</p>
            <p className="mt-1 text-xs text-amber-900">{detail.dmNotes}</p>
          </div>
        )}
      </div>
    ),
    renderForm: (mode, initial, onDone) => (
      <NpcForm
        mode={mode}
        initial={initial}
        onSubmit={async (_body: NpcBody) => {
          await new Promise((r) => setTimeout(r, 400));
          setLastAction(`(Catalog) onSubmit stub → ${mode} — no real server action`);
          setTimeout(() => setLastAction(null), 2000);
          return { ok: true };
        }}
        onDone={onDone}
      />
    ),
    onDelete,
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-ink-mute font-mono">
        DM view — search, tap row → detail sheet, FAB → create form. All mutations are stubs.
      </p>
      <div className="border border-line rounded-md bg-paper overflow-hidden" style={{ maxWidth: 375 }}>
        <WorldEntityShell {...props} />
      </div>
      {lastAction && (
        <p className="text-[10px] text-primary-deep font-mono text-center">{lastAction}</p>
      )}
    </div>
  );
}
