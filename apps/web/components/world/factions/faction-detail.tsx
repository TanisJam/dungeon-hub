// FactionDetail — renders faction detail content inside V3Sheet.
// REQ-FAC-01, REQ-GATE-01: DM view includes dmNotes; player view omits it (absent, not hidden).

import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import type { FactionRow, FactionState } from '@/app/herramientas/actions';

interface FactionDetailProps {
  detail: FactionRow;
  effectiveView: EffectiveView;
}

const STATE_LABELS: Record<FactionState, string> = {
  active: 'Activa',
  dormant: 'Dormida',
  destroyed: 'Destruida',
  disbanded: 'Disuelta',
};

const STATE_TONES: Record<FactionState, PillTone> = {
  active: 'primary',
  dormant: 'stone',
  destroyed: 'ink',
  disbanded: 'amber',
};

export function FactionDetailView({ detail, effectiveView }: FactionDetailProps) {
  return (
    <div className="space-y-4">
      {/* Name + State */}
      <div className="flex items-center gap-3">
        <h3 className="flex-1 font-display text-xl text-ink">{detail.name}</h3>
        <Pill tone={STATE_TONES[detail.state]} size="md">
          {STATE_LABELS[detail.state]}
        </Pill>
      </div>

      {/* Description */}
      {detail.description && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Descripción
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-ink">
            {detail.description}
          </p>
        </div>
      )}

      {/* dmNotes — DM view only (REQ-GATE-01: absence, not disable) */}
      {effectiveView === 'dm' && detail.dmNotes && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Notas del DM
          </p>
          <p className="whitespace-pre-wrap break-words rounded-md bg-paper-soft p-3 text-sm text-ink">
            {detail.dmNotes}
          </p>
        </div>
      )}
    </div>
  );
}
