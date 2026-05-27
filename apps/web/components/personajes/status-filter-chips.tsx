'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { parseChip } from '@/lib/personajes-filter';
import type { ChipCounts, StatusChip } from './types';

const CHIPS: ReadonlyArray<{ key: StatusChip; label: string; showCount: boolean }> = [
  { key: 'active', label: 'Activos', showCount: true },
  { key: 'pending', label: 'Pendientes', showCount: true },
  { key: 'retired', label: 'Retirados', showCount: false },
  { key: 'draft', label: 'Borradores', showCount: true },
  { key: 'all', label: 'Todos', showCount: false },
];

export function StatusFilterChips({ counts }: { counts: ChipCounts }) {
  const rawStatus = useSearchParams().get('status');
  const active = parseChip(rawStatus ?? undefined);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CHIPS.map(({ key, label, showCount }) => {
        const on = key === active;
        return (
          <Link
            key={key}
            href={`/personajes?status=${key}`}
            className={`shrink-0 rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold transition-colors ${
              on
                ? 'personajes-chip-on border-accent-deep'
                : 'border-line bg-surface text-ink-mute hover:border-ink-mute'
            }`}
          >
            {showCount ? `${label} · ${counts[key]}` : label}
          </Link>
        );
      })}
    </div>
  );
}
