/**
 * coords.ts — Pure pixel↔Leaflet transform for the Leaflet CRS.Simple world map.
 *
 * DEEP-ZOOM PYRAMID + Y-AXIS CONVENTION (ADR-2, REQ-WM-04):
 *
 *   The tile pyramid is a STANDARD deep-zoom pyramid:
 *     - zoom MAX_ZOOM (5) = NATIVE resolution (10200×6600 → 40×26 tiles).
 *     - each LOWER zoom HALVES the image (downscale). zoom 0 = whole map (2×1 tiles).
 *     - Total ≈ 1398 tiles. (A z0=native scheme would 32× UPSCALE at z5 → ~1M tiles.)
 *
 *   Because native res lands at MAX_ZOOM, world pixel coords must be divided by
 *   SCALE = 2^MAX_ZOOM so that, at zoom z, Leaflet maps a world pixel to
 *   `pixel · 2^(z - MAX_ZOOM)` — i.e. native (1:1) at MAX_ZOOM. This is the
 *   `crs.pointToLatLng(point, MAX_ZOOM)` relationship, written purely (no Leaflet
 *   import) so it is unit-testable without a DOM and cannot silently mirror.
 *
 *   Y-FLIP: Leaflet CRS.Simple's transformation already flips Y (its internal -1).
 *   A world pixel y measured DOWN from the top maps to a NEGATIVE latitude, so the
 *   image top (y=0) sits ABOVE the image bottom (y=H) on screen. tms={false}.
 *
 *   Mapping (W=10200, H=6600, SCALE=32):
 *     worldToLatLng(x, y)     → Leaflet [lat, lng] = [-y / SCALE, x / SCALE]
 *     latLngToWorld(lat, lng) → { worldX: lng · SCALE, worldY: -lat · SCALE }
 *
 *   Corner check (mental model):
 *     Image top-left  (0, 0)         → Leaflet [0,        0]        (top-left)
 *     Image bot-right (10200, 6600)  → Leaflet [-206.25,  318.75]  (bottom-right)
 *
 * IMAGE DIMENSIONS:
 *   Width  (W) = 10200 px,  Height (H) = 6600 px.
 *   Source: data/Sword-Coast-Map_HighRes.jpg
 */

/**
 * Source image pixel width — data/Sword-Coast-Map_HighRes.jpg.
 * These are the authoritative TS constants. The .mjs build scripts (tile-map.mjs,
 * seed-poi-coords.mjs) keep their own literals with a sync comment — they cannot
 * import TS modules. The API also duplicates these as POI_COORD_MAX_X/Y (same reason).
 */
export const IMAGE_W = 10200;
/** Source image pixel height — data/Sword-Coast-Map_HighRes.jpg. */
export const IMAGE_H = 6600;

/** Native-resolution zoom level (= max zoom). Must match tile-map.mjs MAX_ZOOM. */
export const MAX_ZOOM = 5;

/** Pixel→LatLng divisor so that native resolution lands at MAX_ZOOM. */
export const SCALE = 2 ** MAX_ZOOM; // 32

/** Normalize -0 → +0 so outputs compare cleanly (a "-0" latitude is harmless to Leaflet). */
const norm = (n: number): number => (n === 0 ? 0 : n);

/**
 * Convert pixel coordinates (world space, y measured DOWN from the top) to
 * Leaflet CRS.Simple [lat, lng].
 *
 * @param x - World X pixel coordinate (0 = left edge)
 * @param y - World Y pixel coordinate (0 = top edge, increases downward)
 * @returns Leaflet [lat, lng] tuple for MapContainer bounds / Marker placement
 */
export const worldToLatLng = (x: number, y: number): [number, number] => [
  norm(-y / SCALE),
  norm(x / SCALE),
];

/**
 * Convert Leaflet CRS.Simple [lat, lng] back to pixel coordinates (world space).
 * Inverse of worldToLatLng — used by the DM drag-end handler (Slice 3).
 *
 * @param lat - Leaflet latitude (negative over the image)
 * @param lng - Leaflet longitude
 * @returns { worldX, worldY } pixel coordinates in image space (y down from top)
 */
export const latLngToWorld = (lat: number, lng: number): { worldX: number; worldY: number } => ({
  worldX: norm(lng * SCALE),
  worldY: norm(-lat * SCALE),
});
