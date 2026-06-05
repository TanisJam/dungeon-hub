// QuestDetail — renders quest detail content inside V3Sheet.
// REQ-QUEST-WEB-PAGE-04: DM view shows all fields including dmNotes; player view omits dm-only quests.
// ADR: description is PLAIN TEXT — rendered with whitespace-pre-wrap.

import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import type { QuestRow, QuestStatus, QuestVisibility } from '@/app/codex/quests/actions';

interface QuestDetailProps {
  detail: QuestRow;
  effectiveView: EffectiveView;
}

const STATUS_LABELS: Record<QuestStatus, string> = {
  available: 'Disponible',
  active: 'Activa',
  completed: 'Completada',
  abandoned: 'Abandonada',
};

const STATUS_TONES: Record<QuestStatus, PillTone> = {
  available: 'primary',
  active: 'amber',
  completed: 'success',
  abandoned: 'neutral',
};

const VISIBILITY_LABELS: Record<QuestVisibility, string> = {
  public: 'Público',
  'dm-only': 'Solo DM',
};

const VISIBILITY_TONES: Record<QuestVisibility, PillTone> = {
  public: 'secondary',
  'dm-only': 'stone',
};

export function QuestDetailView({ detail, effectiveView }: QuestDetailProps) {
  // REQ-QUEST-WEB-PAGE-04: Players must never see dm-only quests; extra client-side guard.
  if (effectiveView === 'player' && detail.visibility === 'dm-only') {
    return (
      <div className="py-8 text-center text-sm text-ink-soft">
        Quest no disponible.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Title + Status */}
      <div className="flex items-start gap-3">
        <h3 className="flex-1 font-display text-xl text-ink">{detail.title}</h3>
        <Pill tone={STATUS_TONES[detail.status]} size="md">
          {STATUS_LABELS[detail.status]}
        </Pill>
      </div>

      {/* Visibility pill (GM only — players won't see dm-only at all) */}
      {effectiveView === 'dm' && (
        <div>
          <Pill tone={VISIBILITY_TONES[detail.visibility]} size="sm">
            {VISIBILITY_LABELS[detail.visibility]}
          </Pill>
        </div>
      )}

      {/* Description — plain text, whitespace-pre-wrap */}
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

      {/* DM Notes — only rendered when effectiveView === 'dm' AND dmNotes present (ADR-2 defense-in-depth) */}
      {effectiveView === 'dm' && detail.dmNotes && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Notas del DM (privado)
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-ink">
            {detail.dmNotes}
          </p>
        </div>
      )}
    </div>
  );
}
