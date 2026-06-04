// HexRowView — renders a single hex row in the list.
// Shows: name | terrain | status (static pill, no filter chips — ADR-4).
// REQ-MAP-01.
// B2: STATUS_STYLE raw-tw-colors removed; status pills now use <Pill> with design tokens.

import type { HexRow, HexStatus } from '@/app/mapa/actions';
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

  return (
    <div className="flex min-h-[44px] items-center gap-3 py-2">
      {/* Name + terrain */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {row.name ?? `Hex (${row.q},${row.r})`}
        </p>
        {row.terrain && (
          <p className="truncate text-xs text-ink-soft">{row.terrain}</p>
        )}
      </div>

      {/* Status pill — static, no filter (ADR-4) */}
      <Pill tone={tone} size="sm">
        {label}
      </Pill>
    </div>
  );
}
