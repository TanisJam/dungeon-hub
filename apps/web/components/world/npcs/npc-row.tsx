// NpcRow — renders one NPC list row.
// REQ-NPC-01: name + status pill, ≥44px (wrapper provides min-h-[44px]).

import { Pill, ListRow } from '@/components/ui';
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
    <ListRow
      title={row.name}
      trailing={
        <Pill tone={STATUS_TONES[row.status]} size="sm">
          {STATUS_LABELS[row.status]}
        </Pill>
      }
    />
  );
}
