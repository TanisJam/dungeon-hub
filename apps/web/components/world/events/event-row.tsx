// EventRow — renders one world-event list row.
// REQ-CRO-02: title + occurredAt + visibility pill, ≥44px (wrapper provides min-h-[44px]).

import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { EventRow as EventRowData, EventVisibility } from '@/app/cronica/actions';

interface EventRowProps {
  row: EventRowData;
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
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export function EventRowView({ row }: EventRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-ink">{row.title}</span>
        <span className="text-xs text-ink-soft">{formatDate(row.occurredAt)}</span>
      </div>
      <Pill tone={VISIBILITY_TONES[row.visibility]} size="sm">
        {VISIBILITY_LABELS[row.visibility]}
      </Pill>
    </div>
  );
}
