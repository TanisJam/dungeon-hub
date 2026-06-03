/**
 * coords.ts — Pure Y-axis transform for Leaflet CRS.Simple world map.
 *
 * Y-AXIS CONVENTION (ADR-2, REQ-WM-04):
 *
 *   Tile generation uses standard ImageMagick order: row 0 = TOP of image (Y increases downward).
 *   Leaflet CRS.Simple has Y increasing UPWARD (origin at bottom-left).
 *   TileLayer uses tms={false} (default slippy-map order) — tiles are Y-DOWN.
 *
 *   The flip lives here, in one pure function, so it is:
 *     (a) unit-testable without Leaflet (no silent mirror bug possible)
 *     (b) inverted by latLngToWorld for DM drag-write (Slice 3)
 *
 *   Mapping formula (H = image height = 6600):
 *     worldToLatLng(x, y)   → Leaflet [lat, lng] = [H - y, x]
 *     latLngToWorld(lat, lng) → { worldX: lng, worldY: H - lat }
 *
 *   Corner check (use these as your mental model):
 *     Image top-left  (0, 0)         → Leaflet [6600, 0]      (max lat = visual top)
 *     Image bot-right (10200, 6600)  → Leaflet [0,    10200]  (min lat = visual bottom)
 *
 * IMAGE DIMENSIONS:
 *   Width  (W) = 10200 px
 *   Height (H) = 6600 px
 *   Source: data/Sword-Coast-Map_HighRes.jpg
 */

/** Image height in pixels. Used as the flip constant. */
const H = 6600;

/**
 * Convert pixel coordinates (world space) to Leaflet CRS.Simple [lat, lng].
 *
 * @param x - World X pixel coordinate (0 = left edge)
 * @param y - World Y pixel coordinate (0 = top edge, increases downward)
 * @returns Leaflet [lat, lng] tuple for use in MapContainer / Marker / TileLayer bounds
 */
export const worldToLatLng = (x: number, y: number): [number, number] => [H - y, x];

/**
 * Convert Leaflet CRS.Simple [lat, lng] back to pixel coordinates (world space).
 * Inverse of worldToLatLng — used by DM drag-end handler (Slice 3).
 *
 * @param lat - Leaflet latitude (Y in Leaflet space, increases upward)
 * @param lng - Leaflet longitude (X in Leaflet space)
 * @returns { worldX, worldY } pixel coordinates in image space
 */
export const latLngToWorld = (lat: number, lng: number): { worldX: number; worldY: number } => ({
  worldX: lng,
  worldY: H - lat,
});
