'use client';

/**
 * map-toggle.tsx — Lista|Mapa segmented control for /mapa.
 *
 * URL-driven: pushes ?view=lista / ?view=mapa to router.
 * Mode is held in the URL (searchParams.view) — shareable and refresh-safe.
 * The Server Component (page.tsx) reads searchParams.view and branches on it.
 *
 * Mobile-first: thumb-reachable at 375px (full-width row of two buttons).
 * Active state is visually differentiated via bg-ink/text-paper vs bg-paper/text-ink.
 *
 * REQ-WM-02.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

type MapView = 'lista' | 'mapa';

interface MapToggleProps {
  /** Currently active view. Derived from searchParams.view in the server component. */
  activeView?: MapView;
}

export function MapToggle({ activeView = 'lista' }: MapToggleProps) {
  const router = useRouter();

  const setView = useCallback(
    (view: MapView) => {
      const params = new URLSearchParams(window.location.search);
      params.set('view', view);
      router.push(`?${params.toString()}`);
    },
    [router],
  );

  return (
    <div
      className="flex w-full overflow-hidden rounded-lg border border-line"
      role="group"
      aria-label="Vista del mapa"
    >
      <button
        type="button"
        onClick={() => setView('lista')}
        aria-pressed={activeView === 'lista'}
        className={[
          'flex-1 min-h-[44px] py-2 px-4 text-sm font-semibold transition-colors',
          activeView === 'lista'
            ? 'bg-ink text-paper'
            : 'bg-paper text-ink hover:bg-paper-soft',
        ].join(' ')}
      >
        Lista
      </button>
      <button
        type="button"
        onClick={() => setView('mapa')}
        aria-pressed={activeView === 'mapa'}
        className={[
          'flex-1 min-h-[44px] py-2 px-4 text-sm font-semibold transition-colors border-l border-line',
          activeView === 'mapa'
            ? 'bg-ink text-paper'
            : 'bg-paper text-ink hover:bg-paper-soft',
        ].join(' ')}
      >
        Mapa
      </button>
    </div>
  );
}
