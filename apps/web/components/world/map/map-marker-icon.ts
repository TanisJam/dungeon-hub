/**
 * map-marker-icon.ts — Leaflet divIcon factory for world map POI markers.
 *
 * Uses L.divIcon (not the default PNG icon) to avoid Next.js webpack asset resolution
 * issues with Leaflet's default icon PNG paths. See CLAUDE.md §11 pitfalls.
 *
 * Tap target: iconSize=[44,44] guarantees ≥44px (CLAUDE.md §2 mobile-first).
 * iconAnchor=[22,44] pins the bottom-center of the pin to the world coordinate.
 *
 * Colors mirror the POI status palette (poi-accordion / hex-detail):
 *   unknown    → muted (gray)
 *   discovered → accent (amber/gold)
 *   cleared    → success (green)
 *   default    → ink (dark)
 *
 * V3 design tokens: bg-ink, ring-paper, --color-accent, etc. expressed as
 * inline CSS so they work without Tailwind class-scanning in the divIcon HTML.
 */

import L from 'leaflet';
import type { PoiStatus } from '@/app/mapa/actions';

/** Map from POI status to marker background color (V3 palette). */
const STATUS_COLORS: Record<PoiStatus | 'default', string> = {
  unknown: '#6b7280',    // gray-500 (muted — unknown to players)
  discovered: '#d97706', // amber-600 (V3 accent)
  cleared: '#16a34a',    // green-600 (V3 success)
  default: '#1a1a2e',    // ink (V3 base)
};

/**
 * Create a Leaflet divIcon for a map marker.
 *
 * @param status - POI status for color coding. Falls back to 'default' if absent.
 * @returns L.DivIcon instance ready for use in a Leaflet Marker.
 */
export function createMarkerIcon(status?: PoiStatus | null): L.DivIcon {
  const color = status ? (STATUS_COLORS[status] ?? STATUS_COLORS.default) : STATUS_COLORS.default;

  // Circular pin with a 4px white ring. Pointer shadow for depth.
  // The outer div (44×44) is the tap target; the inner circle (28×28) is visual.
  const html = `
    <div style="
      width: 44px;
      height: 44px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    ">
      <div style="
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background-color: ${color};
        border: 3px solid #ffffff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.45);
      "></div>
    </div>
  `;

  return L.divIcon({
    className: 'dungeon-hub-map-marker',
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 44], // bottom-center of the 44px container = pin tip
  });
}
