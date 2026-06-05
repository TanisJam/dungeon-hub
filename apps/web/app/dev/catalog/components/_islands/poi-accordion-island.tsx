'use client';

/**
 * PoiAccordionIsland — catalog demo of PoiAccordion.
 *
 * PoiAccordion is the lazy inline accordion for a hex's POIs. It renders a
 * collapsed strip ("Puntos de interés ▼") and only calls onLoadPois when the
 * user expands it (no N+1 on page load). DM view: CRUD controls + PoiForm.
 * Player view: read-only filtered list (status != 'unknown').
 *
 * INTERACTIVE — tap the strip to expand and load fixture POIs (~300ms). Edit
 * and delete buttons are stubs. Create form calls onSubmit stub.
 */

import { useState } from 'react';
import { PoiAccordion } from '@/components/world/map/poi-accordion';
import type { PoiRow, PoiStatus, PoiBody } from '@/app/mapa/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_POIS: PoiRow[] = [
  {
    id: 'poi-ruins',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Ruinas del Templo',
    description: 'Antiguo templo devorado por la niebla. Piedras cubiertas de musgo rúnico.',
    dmNotes: 'Aquí yace el grimorio de Strahd.',
    status: 'discovered' as PoiStatus,
    worldX: 310,
    worldY: 175,
    createdAt: '2024-09-15T00:00:00.000Z',
    updatedAt: '2024-10-01T00:00:00.000Z',
  },
  {
    id: 'poi-camp',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Campamento Vistani',
    description: 'Un grupo de Vistani acampando junto a la hoguera.',
    dmNotes: null,
    status: 'discovered' as PoiStatus,
    worldX: null,
    worldY: null,
    createdAt: '2024-09-20T00:00:00.000Z',
    updatedAt: '2024-09-20T00:00:00.000Z',
  },
  {
    id: 'poi-secret',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Altar Secreto',
    description: null,
    dmNotes: 'Culto a Strahd. Solo visible para DM.',
    status: 'unknown' as PoiStatus,
    worldX: null,
    worldY: null,
    createdAt: '2024-09-25T00:00:00.000Z',
    updatedAt: '2024-09-25T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function PoiAccordionIsland() {
  const [lastAction, setLastAction] = useState<string | null>(null);

  const onLoadPois = async (_hexId: string): Promise<PoiRow[]> => {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_POIS;
  };

  const onCreatePoi = async (_hexId: string, _body: PoiBody) => {
    await new Promise((r) => setTimeout(r, 400));
    setLastAction('(Catalog) onCreatePoi stub → OK');
    setTimeout(() => setLastAction(null), 2000);
    return { ok: true };
  };

  const onUpdatePoi = async (_poiId: string, _body: Partial<PoiBody>) => {
    await new Promise((r) => setTimeout(r, 400));
    setLastAction('(Catalog) onUpdatePoi stub → OK');
    setTimeout(() => setLastAction(null), 2000);
    return { ok: true };
  };

  const onDeletePoi = async (_poiId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 400));
    setLastAction('(Catalog) onDeletePoi stub → OK');
    setTimeout(() => setLastAction(null), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-ink-mute font-mono">
        DM view — expand to load fixture POIs (~300ms). CRUD stubs. "unknown" POI hidden from player view.
      </p>
      <div className="border border-line rounded-md bg-paper overflow-hidden" style={{ maxWidth: 375 }}>
        <PoiAccordion
          hexId="hex-svalich"
          effectiveView="dm"
          onLoadPois={onLoadPois}
          onCreatePoi={onCreatePoi}
          onUpdatePoi={onUpdatePoi}
          onDeletePoi={onDeletePoi}
        />
      </div>
      {lastAction && (
        <p className="text-[10px] text-primary-deep font-mono text-center">{lastAction}</p>
      )}
    </div>
  );
}
