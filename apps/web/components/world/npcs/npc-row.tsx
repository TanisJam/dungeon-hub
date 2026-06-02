// NpcRow — renders one NPC list row.
// REQ-NPC-01: name + status pill, ≥44px (wrapper provides min-h-[44px]).

import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';
import type { NpcRow as NpcRowData, NpcStatus } from '@/app/codex/actions';

interface NpcRowProps {
  row: NpcRowData;
}

const STATUS_LABELS: Record<NpcStatus, string> = {
  alive: 'Vivo',
  dead: 'Muerto',
  missing: 'Desaparecido',
  unknown: 'Desconocido',
};

const STATUS_TONES: Record<NpcStatus, PillTone> = {
  alive: 'primary',
  dead: 'ink',
  missing: 'amber',
  unknown: 'stone',
};

export function NpcRowView({ row }: NpcRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="flex-1 text-sm font-medium text-ink">{row.name}</span>
      <Pill tone={STATUS_TONES[row.status]} size="sm">
        {STATUS_LABELS[row.status]}
      </Pill>
    </div>
  );
}
