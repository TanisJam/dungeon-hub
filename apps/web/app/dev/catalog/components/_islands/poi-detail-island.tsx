'use client';

/**
 * PoiDetailIsland — catalog demo of PoiDetail.
 *
 * PoiDetail is a purely presentational component: renders a POI's name, status
 * badge (via Pill with POI_STATUS_TONE), optional description, and DM-gated
 * dmNotes (isDM prop). Used by PoiAccordion and Leaflet popups.
 *
 * Two combos shown: DM view (dmNotes visible) and player view (dmNotes absent).
 */

import { PoiDetail } from '@/components/world/map/poi-detail';
import type { PoiRow, PoiStatus } from '@/app/mapa/actions';

const FIXTURE_POI_WITH_NOTES: PoiRow = {
  id: 'poi-ruins',
  hexId: 'hex-svalich',
  worldId: 'world-barovia',
  name: 'Ruinas del Templo de Barovia',
  description: 'Antiguo templo devorado por la niebla. Piedras cubiertas de musgo rúnico.',
  dmNotes: 'Aquí yace el grimorio de Strahd. Encuentro opcional CR 5.',
  status: 'discovered' as PoiStatus,
  worldX: 310,
  worldY: 175,
  createdAt: '2024-09-15T00:00:00.000Z',
  updatedAt: '2024-10-01T00:00:00.000Z',
};

const FIXTURE_POI_NO_NOTES: PoiRow = {
  id: 'poi-camp',
  hexId: 'hex-svalich',
  worldId: 'world-barovia',
  name: 'Campamento Vistani',
  description: 'Un grupo de Vistani acampando junto a la hoguera.',
  dmNotes: null,
  status: 'cleared' as PoiStatus,
  worldX: null,
  worldY: null,
  createdAt: '2024-09-20T00:00:00.000Z',
  updatedAt: '2024-09-20T00:00:00.000Z',
};

export function PoiDetailIsland() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-ink-mute font-mono">
        Top: DM view (dmNotes visible in amber). Bottom: player view (dmNotes absent).
      </p>
      <div
        className="border border-line rounded-md bg-paper divide-y divide-line overflow-hidden"
        style={{ maxWidth: 375 }}
      >
        <div className="px-3 py-2">
          <p className="mb-1 text-[10px] font-mono text-ink-soft">isDM=true</p>
          <PoiDetail poi={FIXTURE_POI_WITH_NOTES} isDM={true} />
        </div>
        <div className="px-3 py-2">
          <p className="mb-1 text-[10px] font-mono text-ink-soft">isDM=false</p>
          <PoiDetail poi={FIXTURE_POI_WITH_NOTES} isDM={false} />
        </div>
        <div className="px-3 py-2">
          <p className="mb-1 text-[10px] font-mono text-ink-soft">cleared — no dmNotes</p>
          <PoiDetail poi={FIXTURE_POI_NO_NOTES} isDM={true} />
        </div>
      </div>
    </div>
  );
}
