// FactionRow — renders one faction list row.
// REQ-FAC-01: name + state pill, ≥44px (wrapper provides min-h-[44px]).

import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { FactionRow as FactionRowData, FactionState } from '@/app/codex/actions';

interface FactionRowProps {
  row: FactionRowData;
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

export function FactionRowView({ row }: FactionRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="flex-1 text-sm font-medium text-ink">{row.name}</span>
      <Pill tone={STATE_TONES[row.state]} size="sm">
        {STATE_LABELS[row.state]}
      </Pill>
    </div>
  );
}
