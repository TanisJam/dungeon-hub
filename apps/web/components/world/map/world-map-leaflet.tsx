'use client';

/**
 * world-map-leaflet.tsx — Leaflet client island for the Sword Coast world map.
 *
 * 'use client' is required — Leaflet reads window/document and cannot run on the server.
 * This file is dynamically imported with ssr:false by MapClientWrapper.
 *
 * DEEP-ZOOM + Y-AXIS CONVENTION (ADR-2, REQ-WM-04 — read before touching bounds/TileLayer):
 *   - Pyramid: zoom MAX_ZOOM (5) = native res; lower zooms downscale. tms={false}.
 *   - Tiles are generated Y-DOWN (row 0 = top of image, standard ImageMagick order).
 *   - Bounds + every marker are placed via worldToLatLng(x, y) from coords.ts
 *     (= [-y/SCALE, x/SCALE], SCALE=2^MAX_ZOOM). The scale + Y-flip live ONLY there.
 *   - Do NOT hardcode bounds or replicate the flip/scale here.
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
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { worldToLatLng, latLngToWorld, IMAGE_W, IMAGE_H, MAX_ZOOM } from '@/lib/world/map/coords';
import { createMarkerIcon } from './map-marker-icon';
import type { PoiRow } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { PoiDetail } from './poi-detail';

// Import Leaflet CSS — required for map tiles and controls to render correctly.
// Next.js handles this import via its CSS bundler when the component is client-only.
import 'leaflet/dist/leaflet.css';

interface WorldMapLeafletProps {
  /** Base URL for Supabase Storage CDN. Derived from NEXT_PUBLIC_SUPABASE_URL. */
  supabaseUrl: string;
  /** World-scope POI list (SSR-fetched, server-filtered for role). REQ-POI-MARKER-01. */
  pois: PoiRow[];
  /** Effective view — used to gate DM-notes in PoiDetail inside the Popup. REQ-POI-MARKER-02. */
  effectiveView: EffectiveView;
}

/**
 * IMAGE BOUNDS in Leaflet CRS.Simple [lat, lng] space, derived from the SAME
 * worldToLatLng transform used for markers (single source of truth — no duplicated
 * flip/scale). Corners: top-left (0,0)→[0,0], bottom-right (W,H)→[-206.25, 318.75].
 * latLngBounds normalizes to SW/NE regardless of corner order.
 */
const MAP_BOUNDS: L.LatLngBounds = L.latLngBounds(
  worldToLatLng(0, 0),
  worldToLatLng(IMAGE_W, IMAGE_H),
);

/** Center of the map at initial load. */
const MAP_CENTER: L.LatLngExpression = worldToLatLng(IMAGE_W / 2, IMAGE_H / 2);

const MIN_ZOOM = 0;
// MAX_ZOOM (= native-resolution level) imported from coords.ts to stay in lock-step
// with the tile pyramid + the pixel↔LatLng scale.
const INITIAL_ZOOM = 1;

export function WorldMapLeaflet({ supabaseUrl, pois, effectiveView }: WorldMapLeafletProps) {
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
          tileSize={256}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          // Native tiles only go up to MAX_ZOOM; Leaflet upscales the z5 tiles for
          // any zoom beyond that instead of requesting non-existent tiles.
          maxNativeZoom={MAX_ZOOM}
          minNativeZoom={MIN_ZOOM}
          bounds={MAP_BOUNDS}
          noWrap
          attribution="Sword Coast — Forgotten Realms"
        />
        {/*
         * POI marker layer (Slice 2 — REQ-POI-MARKER-01, REQ-POI-DETAIL-01).
         * Only renders markers for POIs with non-null worldX and worldY.
         * POIs with null coords are silently skipped (expected behavior, not a defect).
         * Tap → Popup opens (Leaflet native tap/click — no hover dependency).
         * PoiDetail is the single source of truth for DM-notes gating (REQ-GATE-01).
         */}
        {pois
          .filter((p) => p.worldX != null && p.worldY != null)
          .map((p) => (
            <Marker
              key={p.id}
              position={worldToLatLng(p.worldX!, p.worldY!)}
              icon={createMarkerIcon(p.status)}
            >
              <Popup>
                <PoiDetail poi={p} isDM={effectiveView === 'dm'} />
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
