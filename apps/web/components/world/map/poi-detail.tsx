'use client';

/**
 * PoiDetail — presentational component for a single POI's body.
 *
 * Single source of truth for POI rendering (REQ-POI-DETAIL-01):
 *   - name + status badge
 *   - optional description
 *   - DM-notes gated by isDM (REQ-GATE-01 — lives ONLY here, not duplicated)
 *
 * Used by:
 *   - poi-accordion.tsx (Lista view — inline list item body)
 *   - world-map-leaflet.tsx (Mapa view — inside Leaflet Popup on marker tap)
 *
 * Pure render: no state, no actions, no fetch.
 */

import type { PoiRow, PoiStatus } from '@/app/mapa/actions';

// Exported so consumers (poi-accordion, world-map-leaflet) share one palette.
export const POI_STATUS_LABEL: Record<PoiStatus, string> = {
  unknown: 'Desconocido',
  discovered: 'Descubierto',
  cleared: 'Despejado',
};

export const POI_STATUS_STYLE: Record<PoiStatus, string> = {
  unknown: 'bg-stone-100 text-stone-600',
  discovered: 'bg-blue-100 text-blue-700',
  cleared: 'bg-green-100 text-green-700',
};

interface PoiDetailProps {
  poi: PoiRow;
  /** Pass effectiveView === 'dm' from the container. Single-sources the DM gate. */
  isDM: boolean;
}

export function PoiDetail({ poi, isDM }: PoiDetailProps) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-ink">{poi.name}</p>
        <span
          className={[
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            POI_STATUS_STYLE[poi.status] ?? 'bg-stone-100 text-stone-600',
          ].join(' ')}
        >
          {POI_STATUS_LABEL[poi.status] ?? poi.status}
        </span>
      </div>
      {poi.description && (
        <p className="mt-0.5 text-xs text-ink-soft line-clamp-2">{poi.description}</p>
      )}
      {/* DM notes — absent for players (REQ-GATE-01 single source of truth) */}
      {isDM && poi.dmNotes && (
        <p className="mt-0.5 text-xs text-amber-700 italic">DM: {poi.dmNotes}</p>
      )}
    </div>
  );
}
