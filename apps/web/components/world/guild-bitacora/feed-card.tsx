'use client';

/**
 * FeedCard — renders one normalized FeedItem in the unified guild bitácora feed.
 *
 * bitacora-gremio W4, ADR-4, REQ-GREM-FD-02.
 * REQ-RENAME-03 (barrido-final): moved from components/world/cronica/ → guild-bitacora/.
 * Mobile-first 375px: full-bleed card, no hover-dependent interactions.
 * Source badge: gremio | dm | evento.
 * Seal badge: confirmed (green) | debunked (red, body struck-through). Read-path
 * tolerance: debunked rows render degraded — never hidden, never crash (gc-invariants #1808).
 * Tags: compact chips, display-only (non-interactive on the card).
 * Min 44px tap target per mobile-first convention (CLAUDE.md §2).
 *
 * Seal controls (bitacora-gremio-sealing #3.10): DM-only "Confirmar" / "Refutar"
 * buttons, gated on `effectiveView === 'dm'` — the same server-derived view
 * flag every other DM-only affordance in this app threads through props (see
 * EncuentrosListView, EventClientWrapper). The gate here is purely cosmetic:
 * POST /contributions/:id/seal re-checks world-GM access itself and returns
 * 403 regardless of what the client believes. Re-sealing is allowed
 * (last-write-wins); un-sealing is NOT offered — the API has no way to clear
 * a seal (see sealContribution in app/bitacora/actions.ts).
 */

import { useState, useTransition } from 'react';
import { sealContribution } from '@/app/bitacora/actions';
import type { FeedItem, FeedSource } from '@/app/bitacora/actions';
import { Pill } from '@/components/ui';

// ---------------------------------------------------------------------------
// Source label + tone map
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<FeedSource, string> = {
  gremio: 'Gremio',
  dm: 'DM',
  evento: 'Evento',
};

// ---------------------------------------------------------------------------
// Entity kind → display label map (guild-feed-linked-entity-refs ADR-5)
// ---------------------------------------------------------------------------

const ENTITY_KIND_LABEL: Record<string, string> = {
  bestiary: 'Bestiario',
  npc: 'NPC',
  faction: 'Facción',
  location: 'Lugar',
};

const SOURCE_TONE: Record<FeedSource, 'primary' | 'accent' | 'secondary'> = {
  gremio: 'primary',
  dm: 'accent',
  evento: 'secondary',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function snippet(text: string | null, maxLen = 120): string {
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FeedCardProps {
  item: FeedItem;
  /** Server-derived DM/player view flag (REQ-WIS-08). Defaults to 'player' — seal
   *  controls stay hidden unless a caller explicitly threads the DM view through. */
  effectiveView?: 'dm' | 'player';
}

export function FeedCard({ item, effectiveView = 'player' }: FeedCardProps) {
  const isGm = effectiveView === 'dm';

  // Local override so a successful seal reflects immediately without waiting
  // for the parent list to re-fetch. `undefined` = defer to `item.sealedStatus`.
  const [sealOverride, setSealOverride] = useState<'confirmed' | 'debunked' | undefined>(
    undefined,
  );
  const [sealError, setSealError] = useState<string | null>(null);
  const [isSealing, startSeal] = useTransition();

  const sealedStatus = sealOverride ?? item.sealedStatus ?? null;
  const isDebunked = sealedStatus === 'debunked';
  const isConfirmed = sealedStatus === 'confirmed';

  function handleSeal(next: 'confirmed' | 'debunked') {
    if (isSealing) return;
    setSealError(null);
    startSeal(async () => {
      const result = await sealContribution(item.id, next);
      if (result.ok) {
        setSealOverride(result.data.sealedStatus);
      } else {
        setSealError(result.error);
      }
    });
  }

  return (
    <article className="relative w-full rounded-lg border border-line bg-paper px-4 py-3 flex flex-col gap-2 min-h-[44px]">
      {/* Header row: source badge + seal badge + date */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Source badge: show "Bitácora" when gremio + sourceBitacoraPageId present (ADR-7 REQ-SHARE-07) */}
        {item.source === 'gremio' && item.sourceBitacoraPageId ? (
          <Pill tone="primary" fill="soft" size="sm">
            Bitácora
          </Pill>
        ) : (
          <Pill tone={SOURCE_TONE[item.source]} fill="soft" size="sm">
            {SOURCE_LABEL[item.source]}
          </Pill>
        )}

        {isConfirmed && (
          <Pill tone="success" fill="soft" size="sm">
            Confirmado
          </Pill>
        )}
        {isDebunked && (
          <Pill tone="danger" fill="soft" size="sm">
            Refutado
          </Pill>
        )}

        <span className="ml-auto text-[10px] text-ink-soft">{formatDate(item.sortAt)}</span>
      </div>

      {/* Title or body snippet */}
      {item.title ? (
        <h3 className={`text-sm font-semibold text-ink leading-snug${isDebunked ? ' line-through opacity-60' : ''}`}>
          {item.title}
        </h3>
      ) : null}

      {item.body ? (
        <p className={`text-sm text-ink-mute leading-relaxed${isDebunked ? ' line-through opacity-60' : ''}`}>
          {snippet(item.body)}
        </p>
      ) : null}

      {/* Tag chips — display only */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-pill bg-paper-soft px-2 py-0.5 text-[10px] font-medium text-ink-soft"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Linked-entity card — v1 non-interactive display (guild-feed-linked-entity-refs REQ-GFLE-06, ADR-5)
          Renders ONLY when refEntityName is present (null/undefined = no card, no regression).
          Mobile-first 375px: full-width, min-h-[44px] tap target (iOS HIG).
          SECURITY: name only — dmNotes and parentHexStatus NEVER rendered here (ADR-6). */}
      {item.refEntityName ? (
        <div
          data-testid="entity-card"
          className="flex w-full items-center gap-2 rounded-md border border-line bg-paper-soft px-3 min-h-[44px]"
        >
          {item.refEntityKind && ENTITY_KIND_LABEL[item.refEntityKind] ? (
            <span className="shrink-0 rounded-pill bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {ENTITY_KIND_LABEL[item.refEntityKind]}
            </span>
          ) : null}
          <span className="truncate text-sm font-medium text-ink">{item.refEntityName}</span>
        </div>
      ) : null}

      {/* DM-only seal controls (bitacora-gremio-sealing #3.10, REQ-CK-NOTE-07).
          Cosmetic gate only — POST /contributions/:id/seal re-checks world-GM
          access server-side and returns 403 for anyone else. Re-seal allowed
          (last-write-wins); no "quitar sello" control — the API does not
          accept clearing a seal (see sealContribution doc comment). */}
      {isGm && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2" role="group" aria-label="Sellar aporte">
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={isConfirmed}
              disabled={isSealing || isConfirmed}
              onClick={() => handleSeal('confirmed')}
              className="min-h-[44px] flex-1 rounded-md border border-success/50 bg-success-soft px-3 py-2 text-xs font-semibold text-success transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSealing ? 'Confirmando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              aria-pressed={isDebunked}
              disabled={isSealing || isDebunked}
              onClick={() => handleSeal('debunked')}
              className="min-h-[44px] flex-1 rounded-md border border-danger/50 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSealing ? 'Refutando…' : 'Refutar'}
            </button>
          </div>
          {sealError && (
            <p role="alert" className="text-[10px] font-medium text-danger">
              {sealError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
