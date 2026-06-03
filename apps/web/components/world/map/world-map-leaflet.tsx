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
 * SLICE 3 SCOPE: tap-to-place PlaceModeClickCatcher.
 * B2 Refinement: DM drag removed — edit/move gated behind popup buttons.
 *
 * REQ-WM-03, REQ-WM-04, REQ-PLACE-TAP-04, REQ-PLACE-BOUNDS-02.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { worldToLatLng, latLngToWorld, IMAGE_W, IMAGE_H, MAX_ZOOM } from '@/lib/world/map/coords';
import { createMarkerIcon } from './map-marker-icon';
import type { PoiRow } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { PoiDetail } from './poi-detail';
import { updatePoi } from '@/app/mapa/actions';
import type { PlacementTarget } from './map-client-wrapper';
import { MapFlyTo } from './map-fly-to';
import type { FlyTarget } from './map-fly-to';
import { PoiMapDrawer } from './poi-map-drawer';

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
  /**
   * Create-mode flag (REQ-PWC-CREATE-03, ADR-4).
   * When true, CreateModeClickCatcher is mounted — a map tap captures coords for a new POI.
   * Mutual exclusion with placement: FAB is suppressed when placement != null, so both
   * catchers are NEVER co-mounted (REQ-PWC-CREATE-05).
   */
  creating: boolean;
  /**
   * Callback fired when DM taps the map in create-mode.
   * Receives clamped worldX/worldY coords; bubbles up to MapClientWrapper to open the create sheet.
   */
  onCreateAt: (worldX: number, worldY: number) => void;
  /**
   * DM-only callback fired when "Editar" is tapped in a POI popup.
   * Bubbles up to MapClientWrapper to open the edit V3Sheet.
   * Only wired when effectiveView === 'dm'.
   */
  onEditPoi: (poi: PoiRow) => void;
  /**
   * ID of the POI currently in drag-to-move mode (B2 Refinement 2).
   * That marker becomes draggable + shows pulse animation; all others stay static.
   * null when no move-mode is active.
   */
  movingPoiId: string | null;
  /**
   * Pending drag position for the moving marker.
   * When non-null, the moving marker's position is controlled by this value.
   * When null (no drag yet, or after Cancelar), falls back to poi.worldX/worldY.
   */
  pendingMoveCoords: { worldX: number; worldY: number } | null;
  /**
   * Called when DM taps "Mover" in a popup — enters move-mode for that POI.
   * Closes the popup and fires onStartMove(poi) to MapClientWrapper.
   */
  onStartMove: (poi: PoiRow) => void;
  /**
   * Called on each dragend of the moving marker with the new clamped worldX/worldY.
   * Bubbles to MapClientWrapper to update pendingMoveCoords.
   */
  onMoveDrag: (worldX: number, worldY: number) => void;
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

/**
 * CreateModeClickCatcher — useMapEvents child mounted ONLY during create-mode.
 *
 * REQ-PWC-CREATE-03: while active, a tap on the map captures worldX/worldY for a NEW POI
 * via the onCreate callback. Mirrors PlaceModeClickCatcher exactly (same latLngToWorld +
 * clamp pattern). CONDITIONALLY MOUNTED so when NOT in create-mode there is no click
 * listener at all — normal taps pan/open popups as before.
 *
 * Mutual exclusion (REQ-PWC-CREATE-05): creating and placement (place-mode URL param)
 * are structurally disjoint — the FAB that sets creating=true is suppressed when
 * placement != null. These two catchers are NEVER co-mounted.
 */
function CreateModeClickCatcher({ onCreate }: { onCreate: (x: number, y: number) => void }) {
  useMapEvents({
    click(e) {
      const { worldX, worldY } = latLngToWorld(e.latlng.lat, e.latlng.lng);
      onCreate(clamp(worldX, 0, IMAGE_W), clamp(worldY, 0, IMAGE_H));
    },
  });
  return null;
}

/**
 * MapPopupCloser — null-return child that closes all open Leaflet popups when
 * `active` flips from false to true. Used to close the POI popup automatically
 * when DM taps "Mover" and move-mode activates (B2 Refinement 2).
 * Must be inside <MapContainer> to call useMap().
 */
function MapPopupCloser({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (active) map.closePopup();
  }, [active, map]);
  return null;
}

export function WorldMapLeaflet({ supabaseUrl, pois, effectiveView, placement, creating, onCreateAt, onEditPoi, movingPoiId, pendingMoveCoords, onStartMove, onMoveDrag }: WorldMapLeafletProps) {
  const router = useRouter();

  /**
   * POI list drawer state (REQ-PML-DRAWER-01, ADR-1).
   * Ephemeral client state — no URL needed (all state owners are in this subtree).
   */
  const [drawerOpen, setDrawerOpen] = useState(false);

  /**
   * Fly-to target — set by PoiMapDrawer row taps, read by <MapFlyTo> inside <MapContainer>.
   * Always a FRESH object per click so useEffect([target]) re-runs even for the same POI
   * (REQ-PML-FLYTO-02, ADR-2 — do NOT add a value-equality guard).
   */
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);

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
   * Auto-close drawer when place-mode, create-mode, OR move-mode activates (REQ-PML-DRAWER-04, ADR-5).
   * Conditional render below ALSO unmounts the toggle + drawer in all modes,
   * but this effect resets drawerOpen so re-entering normal map-mode doesn't pop it back.
   */
  useEffect(() => {
    if (placement || creating || movingPoiId) setDrawerOpen(false);
  }, [placement, creating, movingPoiId]);

  // commitCoords was used by the now-removed drag handler (Slice 3).
  // Place-mode tap (PlaceModeClickCatcher) calls updatePoi directly inline.

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
        // position:relative (from leaflet.css) + an explicit zIndex makes the
        // MapContainer its OWN stacking context, trapping Leaflet's internal panes
        // (tiles ~200, markers ~400, popups ~700) so they can't paint over the
        // sibling drawer (z-20) / toggle (z-30). Without this the map covers them.
        style={{ width: '100%', height: '100%', background: 'var(--color-paper)', position: 'relative', zIndex: 0 }}
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
         * Refinement (B2): markers are NO LONGER draggable (drag caused accidental moves).
         * DM edit/move are gated behind explicit "Editar" and "Mover" popup buttons.
         * "Editar" → onEditPoi(poi) → MapClientWrapper opens edit V3Sheet.
         * "Mover"  → onStartMove(poi) → drag-to-move state (B2 Refinement 2, MoveBanner + draggable).
         */}
        {pois
          .filter((p) => p.worldX != null && p.worldY != null)
          .map((p) => {
            const isMoving = p.id === movingPoiId;
            // Controlled position: use pendingMoveCoords while dragging; fall back to stored coords.
            const markerPos = isMoving && pendingMoveCoords
              ? worldToLatLng(pendingMoveCoords.worldX, pendingMoveCoords.worldY)
              : worldToLatLng(p.worldX!, p.worldY!);
            return (
              <Marker
                key={p.id}
                position={markerPos}
                icon={createMarkerIcon(p.status, isMoving)}
                draggable={isMoving}
                eventHandlers={isMoving ? {
                  dragend(e) {
                    const latlng = (e.target as L.Marker).getLatLng();
                    const { worldX, worldY } = latLngToWorld(latlng.lat, latlng.lng);
                    onMoveDrag(clamp(worldX, 0, IMAGE_W), clamp(worldY, 0, IMAGE_H));
                  },
                } : undefined}
              >
                <Popup>
                  <PoiDetail poi={p} isDM={effectiveView === 'dm'} />
                  {effectiveView === 'dm' && !isMoving && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onEditPoi(p)}
                        className="min-h-[44px] flex-1 rounded-md bg-ink px-3 py-1 text-sm font-medium text-surface"
                        data-testid={`poi-edit-btn-${p.id}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartMove(p)}
                        className="min-h-[44px] flex-1 rounded-md border border-ink px-3 py-1 text-sm font-medium text-ink"
                        data-testid={`poi-move-btn-${p.id}`}
                      >
                        Mover
                      </button>
                    </div>
                  )}
                </Popup>
              </Marker>
            );
          })}

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

        {/*
         * CreateModeClickCatcher — conditionally mounted ONLY in create-mode (REQ-PWC-CREATE-03).
         * A map tap captures coords for a NEW free-floating POI, bubbles to MapClientWrapper
         * which opens the V3Sheet create form. NEVER co-mounted with PlaceModeClickCatcher
         * (REQ-PWC-CREATE-05 — the FAB is suppressed when placement != null).
         */}
        {creating && (
          <CreateModeClickCatcher onCreate={onCreateAt} />
        )}

        {/*
         * MapFlyTo — null-return child that calls map.flyTo() via useMap().
         * MUST be inside <MapContainer> (only place where useMap() resolves).
         * Fresh flyTarget object per POI row tap → re-fly on same POI works.
         * REQ-PML-FLYTO-01, REQ-PML-FLYTO-02.
         */}
        <MapFlyTo target={flyTarget} />

        {/*
         * MapPopupCloser — closes all open popups when move-mode activates (B2 Refinement 2).
         * Fired when DM taps "Mover" → movingPoiId becomes non-null → popup closes automatically.
         * MUST be inside <MapContainer> for useMap() to resolve.
         */}
        <MapPopupCloser active={movingPoiId != null} />
      </MapContainer>

      {/*
       * POI drawer toggle + panel — rendered as siblings of <MapContainer> so they
       * overlay the map. Conditionally unmounted in place-mode AND create-mode (ADR-5):
       *   - toggle + drawer DOM is GONE while placement or creating is active → zero z/gesture
       *     conflict with banners (z-30) and click catchers.
       * REQ-PML-DRAWER-02, REQ-PML-DRAWER-04.
       */}
      {!placement && !creating && !movingPoiId && (
        <>
          {/*
           * Toggle button — bottom-LEFT, z-30, above drawer (z-20) and map (z-10).
           * Inline style for bottom (NOT Tailwind bottom-* class) to respect iOS
           * safe-area-inset-bottom — same pattern as the map container itself.
           * REQ-PML-DRAWER-02, ADR-4.
           */}
          {!drawerOpen && (
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="fixed left-4 z-30 flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface shadow-xl"
            style={{ bottom: 'calc(73px + env(safe-area-inset-bottom, 0px) + 16px)' }}
            aria-label={drawerOpen ? 'Cerrar lista de puntos' : 'Abrir lista de puntos'}
            aria-expanded={drawerOpen}
            data-testid="poi-drawer-toggle"
          >
            Puntos
          </button>
          )}

          {/*
           * PoiMapDrawer — fixed-positioned overlay panel with the POI list.
           * NOT a portal, NOT V3Sheet, does NOT lock body scroll.
           * Closed panel is pointer-events-none + off-screen to never block map pan.
           * REQ-PML-DRAWER-01, REQ-PML-DRAWER-03.
           */}
          <PoiMapDrawer
            pois={pois}
            effectiveView={effectiveView}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onFlyTo={(poi) => {
              // Always create a NEW object so useEffect([target]) re-runs for re-fly
              // (REQ-PML-FLYTO-02 — do NOT add a value-equality guard).
              setFlyTarget({ x: poi.worldX!, y: poi.worldY!, poiId: poi.id });
            }}
          />
        </>
      )}
    </div>
  );
}
