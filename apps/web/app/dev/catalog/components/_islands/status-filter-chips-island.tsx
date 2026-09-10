'use client';

/**
 * StatusFilterChipsIsland — catalog-safe replica of StatusFilterChips.
 *
 * The production component uses useSearchParams() to read the current ?status=
 * query param and renders each chip as a Next.js Link that updates the URL.
 * In the catalog we replace both with local state so the chip toggle is fully
 * interactive without URL or router dependency.
 *
 * INTERACTIVE — tap a chip to select it; active chip gets personajes-chip-on style.
 */

import { useState } from 'react';
import { ScrollNav } from '@/components/ui/scroll-nav';
import type { StatusChip, ChipCounts } from '@/components/personajes/types';

const CHIPS: ReadonlyArray<{ key: StatusChip; label: string; showCount: boolean }> = [
  { key: 'active',   label: 'Activos',    showCount: true  },
  { key: 'pending',  label: 'Pendientes', showCount: true  },
  { key: 'retired',  label: 'Retirados',  showCount: false },
  { key: 'draft',    label: 'Borradores', showCount: true  },
  { key: 'all',      label: 'Todos',      showCount: false },
];

const FIXTURE_COUNTS: ChipCounts = {
  active:  3,
  pending: 1,
  retired: 0,
  draft:   2,
  all:     6,
};

type Props = {
  /** Initially selected chip. Defaults to 'active'. */
  initialActive?: StatusChip;
  counts?: ChipCounts;
};

export function StatusFilterChipsIsland({
  initialActive = 'active',
  counts = FIXTURE_COUNTS,
}: Props) {
  const [active, setActive] = useState<StatusChip>(initialActive);

  return (
    <ScrollNav className="pb-0.5">
      {CHIPS.map(({ key, label, showCount }) => {
        const on = key === active;
        return (
          // Same split as the real StatusFilterChips: the button is the tap
          // target, the span is the pill.
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
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
          </button>
        );
      })}
    </ScrollNav>
  );
}
