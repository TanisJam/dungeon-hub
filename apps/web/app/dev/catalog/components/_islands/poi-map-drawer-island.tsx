'use client';

/**
 * PoiMapDrawerIsland — catalog demo of PoiMapDrawer.
 *
 * PoiMapDrawer is a collapsible POI list panel. Mobile: bottom-sheet ~55vh.
 * Desktop: left panel 320px. It does NOT lock body scroll (REQ-PML-DRAWER-01).
 * Placed POIs (worldX/Y != null) trigger onFlyTo; null-coord POIs show "sin ubicación".
 *
 * In the catalog the drawer can't be "fixed" relative to the map viewport, so
 * we render it in relative position inside a constrained frame so it's visible
 * and interactive without overflowing the page.
 *
 * INTERACTIVE — open/close toggle, tap placed POI rows → onFlyTo stub.
 */

import { useState } from 'react';
import { PoiMapDrawer } from '@/components/world/map/poi-map-drawer';
import type { PoiRow, PoiStatus } from '@/app/mapa/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_POIS: PoiRow[] = [
  {
    id: 'poi-castle',
    hexId: 'hex-ravenloft',
    worldId: 'world-barovia',
    name: 'Castillo Ravenloft',
    description: 'La fortaleza de Strahd von Zarovich.',
    dmNotes: null,
    status: 'discovered' as PoiStatus,
    worldX: 512,
    worldY: 256,
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-11-01T00:00:00.000Z',
  },
  {
    id: 'poi-ruins',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Ruinas del Templo',
    description: 'Antiguo templo devorado por la niebla.',
    dmNotes: null,
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
    description: 'Vistani acampando junto a la hoguera.',
    dmNotes: null,
    // null coords — shows "sin ubicación" (no fly-to)
    status: 'cleared' as PoiStatus,
    worldX: null,
    worldY: null,
    createdAt: '2024-09-20T00:00:00.000Z',
    updatedAt: '2024-09-20T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function PoiMapDrawerIsland() {
  const [open, setOpen] = useState(true);
  const [lastFlyTo, setLastFlyTo] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-ink-mute font-mono">
        Drawer rendered relative (not fixed) inside catalog frame. Toggle open/closed. Tap placed POIs to trigger onFlyTo stub.
      </p>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-line bg-paper-soft px-3 py-1 text-xs font-medium text-ink"
        >
          {open ? 'Close drawer' : 'Open drawer'}
        </button>
        {lastFlyTo && (
          <p className="text-[10px] text-primary-deep font-mono">(Catalog) onFlyTo → {lastFlyTo}</p>
        )}
      </div>
      {/* Relative-positioned wrapper so the "fixed" panel is visible without covering the page */}
      <div
        className="relative overflow-hidden border border-line rounded-md bg-surface"
        style={{ maxWidth: 375, minHeight: 260 }}
      >
        {/* Map placeholder background */}
        <div className="absolute inset-0 flex items-center justify-center bg-paper-soft">
          <span className="text-xs text-ink-soft">← mapa aquí</span>
        </div>
        {/*
         * PoiMapDrawer uses fixed positioning in production; in the catalog we
         * force relative so it renders inside this frame without escaping.
         */}
        <div className="relative">
          <div
            className={[
              'inset-x-0 bottom-0 z-20 flex flex-col',
              'h-[220px] w-full rounded-t-xl',
              'bg-surface shadow-xl',
              'transition-transform duration-300',
              open ? '' : 'translate-y-full',
            ].join(' ')}
            style={{ position: 'absolute' }}
          >
            <PoiMapDrawer
              pois={FIXTURE_POIS}
              effectiveView="dm"
              open={open}
              onClose={() => setOpen(false)}
              onFlyTo={(poi) => {
                setLastFlyTo(poi.name);
                setTimeout(() => setLastFlyTo(null), 2000);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
