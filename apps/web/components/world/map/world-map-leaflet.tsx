'use client';

/**
 * world-map-leaflet.tsx — Leaflet client island for the Sword Coast world map.
 *
 * 'use client' is required — Leaflet reads window/document and cannot run on the server.
 * This file is dynamically imported with ssr:false by MapClientWrapper.
 *
 * Y-AXIS CONVENTION (ADR-2, REQ-WM-04 — read this before touching bounds or TileLayer):
 *   - Tiles are generated Y-DOWN (row 0 = top of image, standard ImageMagick order).
 *   - TileLayer uses tms={false} (default). Do NOT change this.
 *   - Leaflet CRS.Simple has Y increasing UPWARD (origin bottom-left).
 *   - Bounds: [[0,0],[H,W]] = [[0,0],[6600,10200]] in Leaflet [lat,lng] space.
 *   - All world pixel coords are placed via worldToLatLng(x, y) from lib/world/map/coords.ts.
 *   - The flip is entirely in that pure function — do NOT replicate it here.
 *   See lib/world/map/coords.ts for the full explanation.
 *
 * LAYOUT — AppShell breakout (ADR-4):
 *   AppShell renders <main className="mx-auto max-w-sm px-4 py-4 pb-28">.
 *   The toggle is rendered inside that <main> above this island.
 *   The map MUST fill the viewport. Strategy: fixed inset-0, top offset =
 *   TopBar height + toggle height (~120px combined). This avoids negative-margin
 *   breakout and is reliable across screen sizes.
 *
 * SLICE 1 SCOPE: TileLayer only — NO markers (added in Slice 2).
 *
 * REQ-WM-03, REQ-WM-04.
 */

import { useEffect } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import L from 'leaflet';

// Import Leaflet CSS — required for map tiles and controls to render correctly.
// Next.js handles this import via its CSS bundler when the component is client-only.
import 'leaflet/dist/leaflet.css';

interface WorldMapLeafletProps {
  /** Base URL for Supabase Storage CDN. Derived from NEXT_PUBLIC_SUPABASE_URL. */
  supabaseUrl: string;
}

/**
 * IMAGE BOUNDS in Leaflet CRS.Simple [lat, lng] space:
 *   lat axis = Y (increases upward in Leaflet, so max lat = H = 6600 = image top)
 *   lng axis = X (increases rightward, so max lng = W = 10200 = image right)
 *
 * bounds[0] = [0,    0]     = bottom-left  = image bottom-left pixel
 * bounds[1] = [6600, 10200] = top-right    = image top-right pixel
 */
const MAP_BOUNDS: L.LatLngBoundsExpression = [
  [0, 0],
  [6600, 10200],
];

/** Center of the map at initial load. */
const MAP_CENTER: L.LatLngExpression = [3300, 5100];

const MIN_ZOOM = 0;
const MAX_ZOOM = 5;
const INITIAL_ZOOM = 0;

export function WorldMapLeaflet({ supabaseUrl }: WorldMapLeafletProps) {
  /**
   * Leaflet has a default-icon PNG resolution issue with webpack/Next.js bundlers.
   * Since we use divIcon for all markers (map-marker-icon.ts), we suppress the
   * default icon setup to prevent console errors about missing marker-icon.png.
   */
  useEffect(() => {
    // @ts-expect-error — _getIconUrl is internal to Leaflet; deleting it suppresses
    // the webpack PNG resolution warning when default icons are not used.
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '',
      iconUrl: '',
      shadowUrl: '',
    });
  }, []);

  /**
   * Tile URL template.
   * Path: {NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/world-maps/sword-coast/{z}/{x}/{y}.jpg
   * tms={false}: row 0 = top of image (matches tile generation convention).
   * Do NOT set tms={true} — tiles are NOT TMS-convention (Y-flipped).
   */
  const tileUrl = `${supabaseUrl}/storage/v1/object/public/world-maps/sword-coast/{z}/{x}/{y}.jpg`;

  return (
    /**
     * Full-bleed breakout from AppShell max-w-sm:
     * fixed inset-0 places the map to fill the full viewport.
     * top-[120px]: accounts for TopBar (~56px) + MapToggle (~48px) + gap.
     * bottom-[64px]: accounts for TabBar height.
     * z-10 keeps the map above page content but below sheets (z-50).
     */
    <div
      className="fixed inset-x-0 bottom-16 top-[120px] z-10"
      data-testid="map-container"
    >
      <MapContainer
        center={MAP_CENTER}
        zoom={INITIAL_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        bounds={MAP_BOUNDS}
        maxBounds={MAP_BOUNDS}
        maxBoundsViscosity={1.0}
        crs={L.CRS.Simple}
        style={{ width: '100%', height: '100%' }}
        className="w-full h-full"
      >
        {/*
         * TileLayer — tms={false} (default) matches tile generation (Y-DOWN rows).
         * The Y-flip for marker placement is in worldToLatLng (coords.ts).
         * Do NOT set tms={true} here — that would double-flip the tiles.
         */}
        <TileLayer
          url={tileUrl}
          tms={false}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          bounds={MAP_BOUNDS}
          attribution="Sword Coast — Forgotten Realms"
        />
      </MapContainer>
    </div>
  );
}
