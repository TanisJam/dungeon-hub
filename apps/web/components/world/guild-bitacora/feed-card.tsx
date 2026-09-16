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
 * Linked-entity tap-to-open (MVP #3.10): the entity card becomes a real <Link>
 * ONLY when a destination exists for the CURRENT viewer — see destinationFor().
 * bestiary/location are viewer-independent (both roles can reach them); npc/faction
 * are DM-only routes (`notFound()` for players — app/herramientas/{npcs,facciones}/page.tsx),
 * so those two kinds render inert for a player even though the ref itself is visible.
 * Never renders a link that would lead to a notFound() page.
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
import Link from 'next/link';
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

/**
 * destinationFor — resolves the entity card's tap target for THIS viewer, or null
 * when no destination exists (feed-entity-tap-to-open, MVP #3.10).
 *
 * Every destination page below is a list route holding its detail in local
 * `useState` (there is no per-entity detail route yet) — the query param merely
 * SEEDS that local state; it carries no authority of its own. Each destination
 * page keeps its own server-side authorization and treats the param as
 * untrusted input that only selects among rows the server already decided to
 * send (ADR-6): a miss (unknown id, out-of-scope row, cascade-filtered POI)
 * degrades to the plain list, never an error.
 *
 * bestiary/location: reachable by both roles — `?slug=`/`?source=` and `?poi=`
 * are new params, distinct from `/mapa`'s existing `?place=` DM placement
 * trigger (reusing it would misfire tap-to-place/move).
 * npc/faction: `/herramientas/{npcs,facciones}` self-gate with `notFound()`
 * for players (REQ-DMTOOLS-02) — never return a link a player can't reach.
 */
function destinationFor(
  kind: string | null | undefined,
  id: string | null | undefined,
  source: string | null | undefined,
  effectiveView: 'dm' | 'player',
): string | null {
  if (!id) return null;

  switch (kind) {
    case 'bestiary': {
      const params = new URLSearchParams({ slug: id });
      if (source) params.set('source', source);
      return `/compendium/monsters?${params.toString()}`;
    }
    case 'location':
      return `/mapa?poi=${encodeURIComponent(id)}`;
    case 'npc':
      return effectiveView === 'dm' ? `/herramientas/npcs?npc=${encodeURIComponent(id)}` : null;
    case 'faction':
      return effectiveView === 'dm'
        ? `/herramientas/facciones?faccion=${encodeURIComponent(id)}`
        : null;
    default:
      return null;
  }
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

        <span className="ml-auto text-label text-ink-soft">{formatDate(item.sortAt)}</span>
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
              className="inline-flex items-center rounded-pill bg-paper-soft px-2 py-0.5 text-label font-medium text-ink-soft"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Linked-entity card (guild-feed-linked-entity-refs REQ-GFLE-06, ADR-5;
          feed-entity-tap-to-open MVP #3.10 — real <Link> when a destination exists).
          Renders ONLY when refEntityName is present (null/undefined = no card, no regression).
          Mobile-first 375px: full-width, min-h-[44px] tap target (iOS HIG).
          SECURITY: name only — dmNotes and parentHexStatus NEVER rendered here (ADR-6). */}
      {item.refEntityName
        ? (() => {
            const kindLabel = item.refEntityKind ? ENTITY_KIND_LABEL[item.refEntityKind] : undefined;
            const href = destinationFor(item.refEntityKind, item.refEntityId, item.refEntitySource, effectiveView);
            const inner = (
              <>
                {kindLabel ? (
                  <span className="shrink-0 rounded-pill bg-primary/10 px-2 py-0.5 text-label font-semibold text-primary">
                    {kindLabel}
                  </span>
                ) : null}
                <span className="truncate text-sm font-medium text-ink">{item.refEntityName}</span>
              </>
            );

            return href ? (
              <Link
                href={href}
                data-testid="entity-card"
                aria-label={kindLabel ? `Ver ${kindLabel}: ${item.refEntityName}` : `Ver ${item.refEntityName}`}
                className="flex w-full items-center gap-2 rounded-md border border-line bg-paper-soft px-3 min-h-[44px] transition-colors hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {inner}
                {/* Touch affordance. hover:bg-paper above is a desktop-only signal,
                    and a phone has no hover — without this the tappable card is
                    pixel-identical to the inert one (CLAUDE.md §2: no
                    hover-dependent flows). Decorative: the accessible name
                    already comes from aria-label. */}
                <span aria-hidden="true" className="ml-auto shrink-0 text-sm text-ink-soft">
                  ›
                </span>
              </Link>
            ) : (
              <div
                data-testid="entity-card"
                className="flex w-full items-center gap-2 rounded-md border border-line bg-paper-soft px-3 min-h-[44px]"
              >
                {inner}
              </div>
            );
          })()
        : null}

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
            <p role="alert" className="text-label font-medium text-danger">
              {sealError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
