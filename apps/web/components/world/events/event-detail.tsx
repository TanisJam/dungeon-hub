// EventDetail — renders event detail content inside V3Sheet.
// REQ-CRO-02, REQ-GATE-01: DM view includes dmNotes + sourceSessionId; player view omits them.
// Players never see dm-only events (API filters at source; this component renders whatever
// the API returned — UI guard is extra defence per spec).

import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import type { EventRow, EventVisibility } from '@/app/bitacora/actions';

interface EventDetailProps {
  detail: EventRow;
  effectiveView: EffectiveView;
}

const VISIBILITY_LABELS: Record<EventVisibility, string> = {
  public: 'Público',
  'dm-only': 'Solo DM',
};

const VISIBILITY_TONES: Record<EventVisibility, PillTone> = {
  public: 'primary',
  'dm-only': 'amber',
};

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export function EventDetailView({ detail, effectiveView }: EventDetailProps) {
  // REQ-CRO-02: Players must never see dm-only events; extra client-side guard.
  if (effectiveView === 'player' && detail.visibility === 'dm-only') {
    return (
      <div className="py-8 text-center text-sm text-ink-soft">
        Evento no disponible.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Title + Visibility */}
      <div className="flex items-start gap-3">
        <h3 className="flex-1 font-display text-xl text-ink">{detail.title}</h3>
        <Pill tone={VISIBILITY_TONES[detail.visibility]} size="md">
          {VISIBILITY_LABELS[detail.visibility]}
        </Pill>
      </div>

      {/* occurredAt */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Fecha
        </p>
        <p className="text-sm text-ink">{formatDate(detail.occurredAt)}</p>
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

      {/* Tags */}
      {detail.tags.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Etiquetas
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex min-h-[28px] items-center rounded-full border border-line bg-paper-soft px-3 py-1 text-xs font-medium text-ink"
              >
                {tag}
              </span>
            ))}
          </div>
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

      {/* sourceSessionId — DM view only */}
      {effectiveView === 'dm' && detail.sourceSessionId && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Sesión origen
          </p>
          <p className="text-sm text-ink-soft">{detail.sourceSessionId}</p>
        </div>
      )}
    </div>
  );
}
