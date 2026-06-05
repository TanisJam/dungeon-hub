// QuestRow — renders one quest list row.
// REQ-QUEST-WEB-PAGE-02: title + status pill, ≥44px (wrapper provides min-h-[44px]).
// REQ-QUEST-WEB-PAGE-04: lock marker for dm-only quests (GM view only).

import { Pill, ListRow } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { QuestRow as QuestRowData, QuestStatus, QuestVisibility } from '@/app/codex/quests/actions';

interface QuestRowProps {
  row: QuestRowData;
  /** When true (DM view), show the dm-only chip on dm-only quests. */
  showDmChip?: boolean;
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

export function QuestRowView({ row, showDmChip }: QuestRowProps) {
  const isDmOnly = row.visibility === 'dm-only';

  return (
    <ListRow
      title={row.title}
      trailing={
        <div className="flex items-center gap-2">
          {showDmChip && isDmOnly && (
            <Pill tone="stone" size="sm">
              {VISIBILITY_LABELS['dm-only']}
            </Pill>
          )}
          <Pill tone={STATUS_TONES[row.status]} size="sm">
            {STATUS_LABELS[row.status]}
          </Pill>
        </div>
      }
    />
  );
}
