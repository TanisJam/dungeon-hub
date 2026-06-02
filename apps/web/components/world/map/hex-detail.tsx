'use client';

// HexDetailView — renders hex detail inside V3Sheet.
// DM sees: name, terrain, status, q/r coords, dmNotes, playerNotes, + POI accordion.
// Player sees: name, terrain, status, playerNotes + filtered POI accordion — NO dmNotes.
//
// POI accordion is rendered here (inside the detail sheet) rather than inline in the
// list row. This avoids the HTML spec violation of <button> inside <button> that would
// occur if PoiAccordion were placed inside WorldEntityShell's row button.
// The design says "each hex row (or the hex detail sheet)" — this uses the sheet variant.
//
// REQ-MAP-01, REQ-GATE-01: dmNotes absent for players (not just hidden).

import type { HexRow, HexStatus, PoiRow, PoiBody } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { PoiAccordion } from './poi-accordion';

const STATUS_LABEL: Record<HexStatus, string> = {
  unexplored: 'Sin explorar',
  rumored: 'Rumoreada',
  explored: 'Explorada',
  cleared: 'Despejada',
};

const STATUS_STYLE: Record<HexStatus, string> = {
  unexplored: 'bg-stone-100 text-stone-600',
  rumored: 'bg-amber-100 text-amber-700',
  explored: 'bg-blue-100 text-blue-700',
  cleared: 'bg-green-100 text-green-700',
};

interface HexDetailViewProps {
  detail: HexRow;
  effectiveView: EffectiveView;
  /** Called once per hexId on accordion expand. MUST NOT be called at mount. */
  onLoadPois: (hexId: string) => Promise<PoiRow[]>;
  /** DM-only POI mutations */
  onCreatePoi: (hexId: string, body: PoiBody) => Promise<{ ok: boolean; error?: string }>;
  onUpdatePoi: (poiId: string, body: Partial<PoiBody>) => Promise<{ ok: boolean; error?: string }>;
  onDeletePoi: (poiId: string) => Promise<void>;
}

export function HexDetailView({
  detail,
  effectiveView,
  onLoadPois,
  onCreatePoi,
  onUpdatePoi,
  onDeletePoi,
}: HexDetailViewProps) {
  const isDM = effectiveView === 'dm';
  const label = STATUS_LABEL[detail.status] ?? detail.status;
  const style = STATUS_STYLE[detail.status] ?? 'bg-stone-100 text-stone-600';

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <h3 className="text-lg font-semibold text-ink">
          {detail.name ?? `Hex (${detail.q},${detail.r})`}
        </h3>
      </div>

      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-ink-soft uppercase tracking-wide">Estado</span>
        <span
          className={[
            'rounded-full px-2 py-0.5 text-xs font-medium',
            style,
          ].join(' ')}
        >
          {label}
        </span>
      </div>

      {/* Terrain */}
      {detail.terrain && (
        <div>
          <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">Terreno</p>
          <p className="mt-1 text-sm text-ink">{detail.terrain}</p>
        </div>
      )}

      {/* Coordinates (DM-only) */}
      {isDM && (
        <div>
          <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">Coordenadas</p>
          <p className="mt-1 text-sm text-ink">
            q={detail.q}, r={detail.r}
          </p>
        </div>
      )}

      {/* Player notes */}
      {detail.playerNotes && (
        <div>
          <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">Notas</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
            {detail.playerNotes}
          </p>
        </div>
      )}

      {/* DM notes — ABSENT for players (REQ-GATE-01) */}
      {isDM && detail.dmNotes && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Notas del DM</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-amber-900">
            {detail.dmNotes}
          </p>
        </div>
      )}

      {/* Lazy POI accordion — loads POIs only when user expands, NOT at detail sheet open.
          REQ-MAP-01: lazy per-hex fetch; POIs cached in HexClientWrapper's poisCache Map. */}
      <div className="-mx-4">
        <PoiAccordion
          hexId={detail.id}
          effectiveView={effectiveView}
          onLoadPois={onLoadPois}
          onCreatePoi={onCreatePoi}
          onUpdatePoi={onUpdatePoi}
          onDeletePoi={onDeletePoi}
        />
      </div>
    </div>
  );
}
