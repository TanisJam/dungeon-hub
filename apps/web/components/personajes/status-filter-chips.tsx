'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { parseChip } from '@/lib/personajes-filter';
import { ScrollNav } from '@/components/ui/scroll-nav';
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
    <ScrollNav className="pb-0.5">
      {CHIPS.map(({ key, label, showCount }) => {
        const on = key === active;
        return (
          // The link is the TAP TARGET; the span is the pill you see. Putting
          // min-h-[44px] on the pill itself would inflate a 27px-tall compact
          // chip into a slab and change the chip row's proportions — a
          // transparent 44px link around it keeps the pill exactly as
          // designed while the measured target clears the minimum.
          <Link
            key={key}
            href={`/personajes?status=${key}`}
            className="shrink-0 inline-flex min-h-[44px] items-center"
          >
            <span
              className={`rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold transition-colors ${
                on
                  ? 'personajes-chip-on border-accent-deep'
                  : 'border-line bg-surface text-ink-mute hover:border-ink-mute'
              }`}
            >
              {showCount ? `${label} · ${counts[key]}` : label}
            </span>
          </Link>
        );
      })}
    </ScrollNav>
  );
}
