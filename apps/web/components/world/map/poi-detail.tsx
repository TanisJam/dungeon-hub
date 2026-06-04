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
 *
 * B2: POI_STATUS_STYLE raw-tw-colors removed. Status badge now uses <Pill> with
 * design tokens via POI_STATUS_TONE. POI_STATUS_LABEL still exported for consumers.
 * POI_STATUS_STYLE export is REMOVED — consumers that imported it must migrate.
 */

import type { PoiRow, PoiStatus } from '@/app/mapa/actions';
import { Pill } from '@/components/ui/pill';
import { POI_STATUS_TONE } from './status-tones';

// Exported so consumers (poi-accordion, world-map-leaflet) share one label palette.
export const POI_STATUS_LABEL: Record<PoiStatus, string> = {
  unknown: 'Desconocido',
  discovered: 'Descubierto',
  cleared: 'Despejado',
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
        <Pill tone={POI_STATUS_TONE[poi.status] ?? 'stone'} size="sm">
          {POI_STATUS_LABEL[poi.status] ?? poi.status}
        </Pill>
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
