// JournalDetail — renders journal entry detail content inside V3Sheet.
// REQ-CRO-03, REQ-GATE-01: DM view shows all fields; player view omits dm-only entries.
// ADR-3: body is PLAIN TEXT — rendered with whitespace-pre-wrap, NO markdown library.

import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import type { JournalRow, JournalVisibility } from '@/app/bitacora/actions';

interface JournalDetailProps {
  detail: JournalRow;
  effectiveView: EffectiveView;
}

const VISIBILITY_LABELS: Record<JournalVisibility, string> = {
  public: 'Público',
  'dm-only': 'Solo DM',
};

const VISIBILITY_TONES: Record<JournalVisibility, PillTone> = {
  public: 'primary',
  'dm-only': 'amber',
};

export function JournalDetailView({ detail, effectiveView }: JournalDetailProps) {
  // REQ-CRO-03: Players must never see dm-only notes; extra client-side guard.
  if (effectiveView === 'player' && detail.visibility === 'dm-only') {
    return (
      <div className="py-8 text-center text-sm text-ink-soft">
        Nota no disponible.
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

      {/* Body — ADR-3: plain text, whitespace-pre-wrap (no markdown) */}
      {detail.body && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Contenido
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-ink">
            {detail.body}
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
    </div>
  );
}
