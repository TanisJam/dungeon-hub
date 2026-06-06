'use client';

/**
 * ContributionComposer — "＋ Agregar nota" affordance on a known entity detail.
 *
 * codex-knowledge B-2 (SDD tasks #1950, spec #1947, design #1948 §4.3):
 *   REQ-CK-NOTE-02: button opens a bottom-sheet composer (mobile-first, 375px).
 *   REQ-CK-NOTE-02: submitting calls createContribution with visibility=personal.
 *   REQ-CK-NOTE-02: no edit or delete affordance (append-only invariant, REQ-CK-GC-03).
 *   REQ-CK-NOTE-03: caller is responsible for showing only on known entities.
 *
 * Mobile-first: full-width, min-h-[44px] tap target. Tap-outside-to-close via V3Sheet.
 * Desktop: same component — sheet opens in center overlay (V3Sheet handles layout).
 *
 * This arc encodes NO PHB rule.
 */

import { useState } from 'react';
import { V3Sheet } from '@/components/ui';
import { createContribution } from '@/app/codex/actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContributionComposerProps {
  worldId: string;
  refEntityKind: string;
  refEntityId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContributionComposer({
  worldId,
  refEntityKind,
  refEntityId,
}: ContributionComposerProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setError(null);
    setSubmitting(true);

    const result = await createContribution({
      worldId,
      body: trimmed,
      contributionType: 'nota',
      refEntityKind,
      refEntityId,
      visibility: 'personal',
    });

    setSubmitting(false);

    if (result.ok) {
      setBody('');
      setOpen(false);
    } else {
      setError(result.error ?? 'No se pudo guardar la nota.');
    }
  }

  function handleClose() {
    setOpen(false);
    setBody('');
    setError(null);
  }

  return (
    <>
      {/* Trigger button — REQ-CK-NOTE-02: thumb-reachable, min-h-[44px] */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink hover:bg-paper transition-colors"
        aria-label="Agregar nota"
      >
        <span aria-hidden="true">＋</span>
        <span>Agregar nota</span>
      </button>

      {/* Bottom-sheet composer — tap-outside-to-close via V3Sheet */}
      <V3Sheet open={open} onClose={handleClose} title="Nueva nota">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="contribution-body"
              className="block text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1"
            >
              Nota
            </label>
            <textarea
              id="contribution-body"
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribí tu nota sobre esta entidad…"
              rows={4}
              className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}

          <div className="sticky bottom-0 bg-paper py-2">
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="min-h-[44px] w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
            >
              {submitting ? 'Guardando…' : 'Guardar nota'}
            </button>
          </div>
        </form>
      </V3Sheet>
    </>
  );
}
