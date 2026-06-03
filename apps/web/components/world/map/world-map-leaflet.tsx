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
 * SLICE 3 SCOPE: DM draggable markers + tap-to-place PlaceModeClickCatcher.
 *
 * REQ-WM-03, REQ-WM-04, REQ-PLACE-DRAG-01, REQ-PLACE-DRAG-02,
 * REQ-PLACE-TAP-04, REQ-PLACE-BOUNDS-02.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { worldToLatLng, latLngToWorld, IMAGE_W, IMAGE_H, MAX_ZOOM } from '@/lib/world/map/coords';
import { createMarkerIcon } from './map-marker-icon';
import type { PoiRow } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { PoiDetail } from './poi-detail';
import { updatePoi } from '@/app/mapa/actions';
import type { PlacementTarget } from './map-client-wrapper';

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
  /**
   * Place-mode target: the POI currently being placed on the map.
   * When non-null, PlaceModeClickCatcher is mounted so map taps commit coords.
   * REQ-PLACE-TAP-04.
   */
  placement: PlacementTarget | null;
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

/**
 * Clamp a value to [lo, hi].
 * Used to prevent near-boundary drag/tap gestures from producing out-of-range
 * coords that would trip the Zod .max() guard (REQ-PLACE-BOUNDS-02).
 */
const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

/**
 * PlaceModeClickCatcher — useMapEvents child mounted ONLY during place-mode.
 *
 * REQ-PLACE-TAP-04: while active, a tap on the map commits worldX/worldY for the
 * target POI via the onPlace callback. Because the component is CONDITIONALLY MOUNTED
 * (not just conditionally branching inside an always-present handler), when NOT in
 * place-mode there is no click listener at all — normal map taps pan/close popups
 * exactly as in Slice 2.
 */
function PlaceModeClickCatcher({ onPlace }: { onPlace: (x: number, y: number) => void }) {
  useMapEvents({
    click(e) {
      const { worldX, worldY } = latLngToWorld(e.latlng.lat, e.latlng.lng);
      onPlace(clamp(worldX, 0, IMAGE_W), clamp(worldY, 0, IMAGE_H));
    },
  });
  return null;
}

export function WorldMapLeaflet({ supabaseUrl, pois, effectiveView, placement }: WorldMapLeafletProps) {
  const router = useRouter();

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
   * commitCoords — persist drag/tap result via Server Action + repaint.
   * REQ-PLACE-DRAG-02, REQ-PLACE-TAP-04: router.refresh() re-pulls SSR so
   * the marker doesn't snap back and new markers appear without a hard reload.
   */
  const commitCoords = async (poiId: string, x: number, y: number) => {
    await updatePoi(poiId, { worldX: x, worldY: y });
    router.refresh();
  };

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
     * bottom: clears TabBar real height (73px) + iOS safe-area inset so the map
     * edge never hides under the TabBar on notched devices.
     * z-10 keeps the map above page content but below sheets (z-50).
     */
    <div
      className="fixed inset-x-0 top-[120px] z-10"
      style={{ bottom: 'calc(73px + env(safe-area-inset-bottom, 0px))' }}
      data-testid="map-container"
    >
      <MapContainer
        center={MAP_CENTER}
        zoom={INITIAL_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM + 1}
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
         *
         * maxZoom=MAX_ZOOM+1 / maxNativeZoom=MAX_ZOOM: Leaflet upscales the native
         * z5 tiles for zoom level 6. No new tiles are needed — maxNativeZoom stays
         * at MAX_ZOOM so Leaflet knows not to request z6 tiles from storage.
         */}
        <TileLayer
          url={tileUrl}
          tms={false}
          tileSize={256}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM + 1}
          // Native tiles only go up to MAX_ZOOM; Leaflet upscales the z5 tiles for
          // zoom level MAX_ZOOM+1 instead of requesting non-existent tiles.
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
         *
         * Slice 3 additions (REQ-PLACE-DRAG-01, REQ-PLACE-DRAG-02):
         * - draggable={effectiveView === 'dm'}: DM-only draggable markers.
         * - dragend handler (DM only): latLngToWorld → clamp → commitCoords.
         *   eventHandlers is undefined for players (no handler attached at all).
         */}
        {pois
          .filter((p) => p.worldX != null && p.worldY != null)
          .map((p) => (
            <Marker
              key={p.id}
              position={worldToLatLng(p.worldX!, p.worldY!)}
              icon={createMarkerIcon(p.status)}
              draggable={effectiveView === 'dm'}
              eventHandlers={
                effectiveView === 'dm'
                  ? {
                      dragend: (e) => {
                        const m = e.target as L.Marker;
                        const { lat, lng } = m.getLatLng();
                        const { worldX, worldY } = latLngToWorld(lat, lng);
                        void commitCoords(
                          p.id,
                          clamp(worldX, 0, IMAGE_W),
                          clamp(worldY, 0, IMAGE_H),
                        );
                      },
                    }
                  : undefined
              }
            >
              <Popup>
                <PoiDetail poi={p} isDM={effectiveView === 'dm'} />
              </Popup>
            </Marker>
          ))}

        {/*
         * PlaceModeClickCatcher — conditionally mounted ONLY in place-mode.
         * REQ-PLACE-TAP-04: when placement is non-null, a tap commits coords for the
         * target POI, then strips ?place from the URL. Outside place-mode this
         * component is unmounted → taps behave exactly as in Slice 2 (pan/popup).
         */}
        {placement && (
          <PlaceModeClickCatcher
            onPlace={(x, y) => {
              void (async () => {
                await updatePoi(placement.id, { worldX: x, worldY: y });
                router.replace('?view=mapa'); // strip ?place from history
                router.refresh(); // repaint with the new marker
              })();
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
