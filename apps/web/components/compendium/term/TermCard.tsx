'use client';

import { CompendiumEntries } from '@/components/compendium';
import type { TermEntry } from './types';

export interface TermCardProps {
  /** Current loading/resolution state of the card */
  state: 'loading' | 'ok' | 'error';
  /** Populated when state === 'ok' */
  entry?: TermEntry;
  /** Error message when state === 'error' */
  error?: string;
}

/**
 * Content panel rendered inside the HoverCard.
 * Uses design-token classes only — no raw Tailwind colors.
 */
export function TermCard({ state, entry, error }: TermCardProps) {
  return (
    <div className="w-80 rounded-md border border-line bg-paper shadow-md text-ink text-sm">
      {state === 'loading' && <LoadingSkeleton />}

      {state === 'ok' && entry && (
        <>
          {/* Name header */}
          <div className="px-3 pt-3 pb-1 border-b border-line">
            <p className="font-semibold text-ink">{entry.name}</p>
          </div>

          {/* Scrollable entries body */}
          <div className="px-3 py-2 max-h-80 overflow-y-auto">
            <CompendiumEntries entries={entry.entries} />
          </div>

          {/* Source citation footer */}
          {entry.sourceCitation && (
            <div className="px-3 py-2 border-t border-line">
              <p className="text-xs text-muted">{entry.sourceCitation}</p>
            </div>
          )}
          {!entry.sourceCitation && entry.source && (
            <div className="px-3 py-2 border-t border-line">
              <p className="text-xs text-muted">{entry.source}</p>
            </div>
          )}
        </>
      )}

      {state === 'error' && (
        <div className="px-3 py-3">
          <p className="text-muted text-xs">{error ?? 'No preview available'}</p>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="px-3 py-3 space-y-2 animate-pulse">
      <div className="h-4 bg-surface-soft rounded w-2/3" />
      <div className="h-3 bg-surface-soft rounded w-full" />
      <div className="h-3 bg-surface-soft rounded w-5/6" />
      <div className="h-3 bg-surface-soft rounded w-4/6" />
    </div>
  );
}
