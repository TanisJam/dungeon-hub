// JournalRow — renders one journal entry list row.
// REQ-CRO-03: title + visibility pill, ≥44px (wrapper provides min-h-[44px]).

import { Pill, ListRow } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { JournalRow as JournalRowData, JournalVisibility } from '@/app/cronica/actions';

interface JournalRowProps {
  row: JournalRowData;
}

const VISIBILITY_LABELS: Record<JournalVisibility, string> = {
  public: 'Público',
  'dm-only': 'Solo DM',
};

const VISIBILITY_TONES: Record<JournalVisibility, PillTone> = {
  public: 'primary',
  'dm-only': 'amber',
};

export function JournalRowView({ row }: JournalRowProps) {
  return (
    <ListRow
      title={row.title}
      trailing={
        <Pill tone={VISIBILITY_TONES[row.visibility]} size="sm">
          {VISIBILITY_LABELS[row.visibility]}
        </Pill>
      }
    />
  );
}
