'use client';

// Generic detail sheet for any compendium category. ADR-4.
// Opens on row tap, fetches full detail (extracted cols + data JSONB), renders
// config.Header + CompendiumEntriesWithTerms body inside V3Sheet.
// REQ-CBROWSE-06: V3Sheet, focus trap, safe-area, loading/error states.

import { useEffect, useState } from 'react';
import { V3Sheet } from '@/components/ui';
import { CompendiumEntriesWithTerms } from '@/components/compendium/term/CompendiumEntriesWithTerms';
import type { Entry } from '@/components/compendium/types';
import { getCompendiumDetail, type CompendiumScope } from '../actions';
import type { CategoryConfig } from '../_config/registry';
import type { CompendiumCategory } from '@/app/compendium/_components/types';

interface DetailSheetProps {
  open: boolean;
  category: CompendiumCategory;
  /** The list-hit row (slug + source + name at minimum). */
  row: unknown;
  /** scope — XOR: {campaign} for /compendium browser; {world} for /codex player view. */
  scope: CompendiumScope;
  worldId: string | null;
  accessToken: string;
  config: CategoryConfig;
  onClose: () => void;
}

/**
 * DetailSheet — generic compendium detail bottom-sheet. ADR-4.
 * Fetch-on-tap: row click opens the sheet immediately (optimistic name/title),
 * then the detail fetch resolves and fills in the full header + entries body.
 * REQ-CBROWSE-06: V3Sheet, loading skeleton, inline error (never throws).
 */
export function DetailSheet({
  open,
  category,
  row,
  scope,
  worldId,
  accessToken,
  config,
  onClose,
}: DetailSheetProps) {
  const [detail, setDetail] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const rowRecord = row as Record<string, unknown>;
  const displayName = (rowRecord.name as string | undefined) ?? '…';

  useEffect(() => {
    if (!open) {
      // Reset when closed so next open gets a fresh fetch
      setDetail(null);
      setLoading(true);
      setError(false);
      return;
    }

    const slug = rowRecord.slug as string;
    const source = rowRecord.source as string;
    if (!slug || !source) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    getCompendiumDetail(category, scope, slug, source)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setError(true);
        } else {
          setDetail(result);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  // scope is a stable value-object from RSC — JSON.stringify prevents stale closure issues.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category, JSON.stringify(scope), rowRecord.slug, rowRecord.source]);

  const detailRecord = detail as Record<string, unknown> | null;
  const entries = detailRecord?.data
    ? ((detailRecord.data as Record<string, unknown>).entries as Entry[] | undefined) ?? []
    : [];

  return (
    <V3Sheet open={open} onClose={onClose} title={displayName}>
      {loading ? (
        <div className="py-8 text-center text-sm text-ink-soft" aria-live="polite">
          Cargando…
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500" aria-live="polite">
          No se pudo cargar el detalle.
        </div>
      ) : detail !== null ? (
        <div>
          <config.Header data={detail} />
          <div className="mt-4">
            <CompendiumEntriesWithTerms
              entries={entries}
              worldId={worldId}
              accessToken={accessToken}
            />
          </div>
        </div>
      ) : null}
    </V3Sheet>
  );
}
