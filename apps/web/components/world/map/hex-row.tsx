// HexRowView — renders a single hex row in the list.
// Shows: name | terrain | status (static pill, no filter chips — ADR-4).
// REQ-MAP-01.

import type { HexRow, HexStatus } from '@/app/mapa/actions';

// Status pill tone map (static — ADR-4: no filter chips)
const STATUS_LABEL: Record<HexStatus, string> = {
  unexplored: 'Sin explorar',
  rumored: 'Rumoreada',
  explored: 'Explorada',
  cleared: 'Despejada',
};

const STATUS_STYLE: Record<HexStatus, string> = {
  unexplored: 'bg-stone-100 text-stone-600',
  rumored: 'bg-amber-100 text-amber-700',
  explored: 'bg-blue-100 text-blue-700',
  cleared: 'bg-green-100 text-green-700',
};

interface HexRowViewProps {
  row: HexRow;
}

export function HexRowView({ row }: HexRowViewProps) {
  const label = STATUS_LABEL[row.status] ?? row.status;
  const style = STATUS_STYLE[row.status] ?? 'bg-stone-100 text-stone-600';

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
      <span
        className={[
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
          style,
        ].join(' ')}
      >
        {label}
      </span>
    </div>
  );
}
