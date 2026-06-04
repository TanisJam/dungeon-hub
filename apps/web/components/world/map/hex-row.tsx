// HexRowView — renders a single hex row in the list.
// Shows: name | terrain | status (static pill, no filter chips — ADR-4).
// REQ-MAP-01.
// B2: STATUS_STYLE raw-tw-colors removed; status pills now use <Pill> with design tokens.
// C2: adopted ListRow (title=name, subtitle=terrain, trailing=status Pill).

import type { HexRow, HexStatus } from '@/app/mapa/actions';
import { ListRow } from '@/components/ui/list-row';
import { Pill } from '@/components/ui/pill';
import { HEX_STATUS_TONE } from './status-tones';

// Status pill label map (static — ADR-4: no filter chips)
const STATUS_LABEL: Record<HexStatus, string> = {
  unexplored: 'Sin explorar',
  rumored: 'Rumoreada',
  explored: 'Explorada',
  cleared: 'Despejada',
};

interface HexRowViewProps {
  row: HexRow;
}

export function HexRowView({ row }: HexRowViewProps) {
  const label = STATUS_LABEL[row.status] ?? row.status;
  const tone = HEX_STATUS_TONE[row.status] ?? 'stone';
  const name = row.name ?? `Hex (${row.q},${row.r})`;

  return (
    <div className="min-h-[44px] flex items-center">
      <ListRow
        title={name}
        subtitle={row.terrain ?? undefined}
        trailing={
          <Pill tone={tone} size="sm">
            {label}
          </Pill>
        }
        className="flex-1"
      />
    </div>
  );
}
