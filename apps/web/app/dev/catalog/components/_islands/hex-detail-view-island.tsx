'use client';

/**
 * HexDetailViewIsland — catalog demo of HexDetailView.
 *
 * HexDetailView is the hex detail sheet body: name, status pill, terrain,
 * q/r coordinates (DM-only), playerNotes, dmNotes (DM-only amber block), and
 * a lazy PoiAccordion that expands on user tap. DM mutations arrive via props.
 *
 * INTERACTIVE — the embedded PoiAccordion expands on tap and loads fixture POIs
 * (~300ms stub). All CRUD ops are stubs. DM view shown (dm badge + dmNotes).
 */

import { useState } from 'react';
import { HexDetailView } from '@/components/world/map/hex-detail';
import type { HexRow, HexStatus, PoiRow, PoiStatus, PoiBody } from '@/app/mapa/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_HEX: HexRow = {
  id: 'hex-svalich',
  worldId: 'world-barovia',
  parentHexId: null,
  scale: 'region',
  q: 3,
  r: -2,
  worldX: 320,
  worldY: 180,
  name: 'Bosque de Svalich',
  terrain: 'forest',
  status: 'explored' as HexStatus,
  dmNotes: 'Un lobo fantasmal patrulla estos bosques de noche. Cuidado con el claro central.',
  playerNotes: 'Vimos huellas de lobo enormes cerca del río.',
  createdAt: '2024-09-12T00:00:00.000Z',
  updatedAt: '2024-10-05T00:00:00.000Z',
};

const FIXTURE_POIS: PoiRow[] = [
  {
    id: 'poi-ruins',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Ruinas del Templo',
    description: 'Antiguo templo devorado por la niebla. Piedras cubiertas de musgo rúnico.',
    dmNotes: 'Aquí yace el grimorio de Strahd (encuentro opcional).',
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
];

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function HexDetailViewIsland() {
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Stub: lazy POI load (accordion calls this only on first expand)
  const onLoadPois = async (_hexId: string): Promise<PoiRow[]> => {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_POIS;
  };

  // Stub: create POI
  const onCreatePoi = async (_hexId: string, _body: PoiBody) => {
    await new Promise((r) => setTimeout(r, 400));
    setLastAction('(Catalog) onCreatePoi stub → OK (no real server action)');
    setTimeout(() => setLastAction(null), 2000);
    return { ok: true };
  };

  // Stub: update POI
  const onUpdatePoi = async (_poiId: string, _body: Partial<PoiBody>) => {
    await new Promise((r) => setTimeout(r, 400));
    setLastAction('(Catalog) onUpdatePoi stub → OK (no real server action)');
    setTimeout(() => setLastAction(null), 2000);
    return { ok: true };
  };

  // Stub: delete POI
  const onDeletePoi = async (_poiId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 400));
    setLastAction('(Catalog) onDeletePoi stub → OK (no real server action)');
    setTimeout(() => setLastAction(null), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-ink-mute font-mono">
        DM view. Expand the POI accordion to load fixture POIs (stub ~300ms). CRUD buttons are stubs.
      </p>
      <div className="border border-line rounded-md bg-paper overflow-hidden" style={{ maxWidth: 375 }}>
        <div className="p-4">
          <HexDetailView
            detail={FIXTURE_HEX}
            effectiveView="dm"
            onLoadPois={onLoadPois}
            onCreatePoi={onCreatePoi}
            onUpdatePoi={onUpdatePoi}
            onDeletePoi={onDeletePoi}
          />
        </div>
      </div>
      {lastAction && (
        <p className="text-[10px] text-primary-deep font-mono text-center">{lastAction}</p>
      )}
    </div>
  );
}
