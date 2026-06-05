'use client';

/**
 * WorldMapPlaceholderIsland — static catalog stand-in for WorldMapLeaflet / MapClientWrapper.
 *
 * The real map stack (WorldMapLeaflet, MapClientWrapper, MapFlyTo, react-leaflet, leaflet)
 * requires a browser window object + tile fetches + server actions on mount. None of those
 * are safe in the catalog. This island is PURELY presentational — no leaflet imports,
 * no server actions, no network.
 *
 * Renders a MapClientWrapper-shaped chrome:
 *   - Top controls bar (disabled-looking pills: capas / zoom+/−)
 *   - Large canvas placeholder (aspect ~16/9, bordered, bg-surface-soft)
 *     with a map glyph + explanatory text
 *   - Below: a live PoiMapDrawer (safe — no window deps) with fixture POIs so the
 *     drawer open/close interaction is still demonstrable.
 *
 * The live map lives in apps/web/components/world/map/map-client-wrapper.tsx.
 */

import { useState } from 'react';
import { PoiMapDrawer } from '@/components/world/map/poi-map-drawer';
import type { PoiRow, PoiStatus } from '@/app/mapa/actions';

// ---------------------------------------------------------------------------
// Fixture POIs (reused across drawer demo)
// ---------------------------------------------------------------------------

const FIXTURE_POIS: PoiRow[] = [
  {
    id: 'poi-castle',
    hexId: 'hex-ravenloft',
    worldId: 'world-barovia',
    name: 'Castillo Ravenloft',
    description: 'La fortaleza de Strahd von Zarovich en lo alto de las montañas.',
    dmNotes: null,
    status: 'discovered' as PoiStatus,
    worldX: 512,
    worldY: 256,
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-11-01T00:00:00.000Z',
  },
  {
    id: 'poi-barovia',
    hexId: 'hex-barovia-village',
    worldId: 'world-barovia',
    name: 'Pueblo de Barovia',
    description: 'El pueblo principal, envuelto en niebla eterna.',
    dmNotes: null,
    status: 'discovered' as PoiStatus,
    worldX: 200,
    worldY: 310,
    createdAt: '2024-09-02T00:00:00.000Z',
    updatedAt: '2024-09-15T00:00:00.000Z',
  },
  {
    id: 'poi-camp',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Campamento Vistani',
    description: null,
    dmNotes: null,
    status: 'cleared' as PoiStatus,
    // null coords — shows "sin ubicación" in the drawer
    worldX: null,
    worldY: null,
    createdAt: '2024-09-20T00:00:00.000Z',
    updatedAt: '2024-09-20T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Disabled control pill
// ---------------------------------------------------------------------------

function ControlPill({ label }: { label: string }) {
  return (
    <span
      aria-disabled="true"
      className="flex items-center justify-center rounded-full border border-line bg-paper-soft px-3 py-1 text-xs font-medium text-ink-soft opacity-60 select-none"
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function WorldMapPlaceholderIsland() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastFlyTo, setLastFlyTo] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2" style={{ maxWidth: 375 }}>
      <p className="text-[10px] text-ink-mute font-mono">
        Leaflet cannot run in the catalog (requires window/tiles). This is a static chrome placeholder.
        The live map lives in MapClientWrapper. The PoiMapDrawer below is the real component.
      </p>

      {/* ── MapClientWrapper-shaped chrome ── */}
      <div className="flex flex-col rounded-md border border-line bg-surface overflow-hidden">

        {/* Top controls bar — disabled-looking pills */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 bg-paper">
          <ControlPill label="Capas" />
          <ControlPill label="+" />
          <ControlPill label="−" />
          <span className="ml-auto text-[10px] text-ink-soft font-mono">
            mapa deshabilitado en catálogo
          </span>
        </div>

        {/* Canvas placeholder */}
        <div
          className="relative flex items-center justify-center bg-paper-soft"
          style={{ aspectRatio: '16/9' }}
        >
          {/* Grid lines suggestion */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 w-full h-full opacity-10"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Center content */}
          <div className="relative flex flex-col items-center gap-2 px-4 text-center">
            {/* Map glyph */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ink-soft opacity-50"
              aria-hidden="true"
            >
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            <p className="text-xs text-ink-soft max-w-[220px]">
              Mapa Leaflet no disponible en el catálogo
              <br />
              <span className="opacity-70">(requiere window/tiles)</span>
            </p>
          </div>

          {/* POI count badge suggestion */}
          <div className="absolute bottom-2 right-2 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-mono text-ink-soft">
            {FIXTURE_POIS.length} POIs (fixture)
          </div>
        </div>

        {/* Drawer toggle button (mimics the real map's overlay toggle) */}
        <div className="flex items-center justify-between border-t border-line px-3 py-2 bg-paper">
          <span className="text-xs text-ink-soft">Puntos de interés</span>
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="rounded-md border border-line bg-paper-soft px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-paper"
          >
            {drawerOpen ? 'Cerrar lista' : 'Ver lista'}
          </button>
        </div>
      </div>

      {/* ── Real PoiMapDrawer below the placeholder chrome ── */}
      <p className="text-[10px] text-ink-mute font-mono">
        Below: real PoiMapDrawer (safe component) — rendered inline here since fixed positioning
        would escape the catalog frame.
      </p>
      <div className="relative overflow-hidden rounded-md border border-line bg-surface" style={{ minHeight: 240 }}>
        <PoiMapDrawer
          pois={FIXTURE_POIS}
          effectiveView="dm"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onFlyTo={(poi) => {
            setLastFlyTo(poi.name);
            setTimeout(() => setLastFlyTo(null), 2000);
          }}
        />
        {!drawerOpen && (
          <div className="flex items-center justify-center py-6 text-xs text-ink-soft">
            Open the drawer via the button above
          </div>
        )}
      </div>

      {lastFlyTo && (
        <p className="text-[10px] text-primary-deep font-mono text-center">
          (Catalog) onFlyTo stub → "{lastFlyTo}" (no real fly-to without Leaflet)
        </p>
      )}
    </div>
  );
}
