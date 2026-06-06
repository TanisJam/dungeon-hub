'use client';

/**
 * ContributionComposer — "＋ Agregar nota" / "＋ Aportar" affordance.
 *
 * codex-knowledge B-2 (SDD tasks #1950, spec #1947, design #1948 §4.3):
 *   REQ-CK-NOTE-02: button opens a bottom-sheet composer (mobile-first, 375px).
 *   REQ-CK-NOTE-02: submitting calls createContribution with visibility=personal.
 *   REQ-CK-NOTE-02: no edit or delete affordance (append-only invariant, REQ-CK-GC-03).
 *   REQ-CK-NOTE-03: caller is responsible for showing only on known entities.
 *
 * bitacora-gremio W4 (ADR-6, REQ-GREM-FD-05, REQ-GREM-CT-02):
 *   - refEntityKind + refEntityId are now OPTIONAL props (general guild notes have no entity ref)
 *   - Optional KNOWLEDGE_TAGS multi-select added below the body textarea
 *   - onClose + onSuccess callbacks for programmatic control from CronicaFeed
 *
 * Mobile-first: full-width, min-h-[44px] tap target. Tap-outside-to-close via V3Sheet.
 * Desktop: same component — sheet opens in center overlay (V3Sheet handles layout).
 *
 * This arc encodes NO PHB rule.
 */

import { useState } from 'react';
import { KNOWLEDGE_TAGS } from '@dungeon-hub/domain/world/codex';
import { V3Sheet } from '@/components/ui';
import { createContribution } from '@/app/herramientas/actions';
import type { FeedItem } from '@/app/cronica/actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContributionComposerProps {
  worldId: string;
  /** Optional entity ref — only required when adding notes to a specific entity. */
  refEntityKind?: string;
  /** Optional entity ref — only required when adding notes to a specific entity. */
  refEntityId?: string;
  /** Called when the sheet should close (programmatic control from parent). */
  onClose?: () => void;
  /** Called after successful submission. Receives a partial FeedItem for optimistic update. */
  onSuccess?: (item?: FeedItem) => void;
}

// ---------------------------------------------------------------------------
// Label map
// ---------------------------------------------------------------------------

const TAG_LABELS: Record<string, string> = {
  monsters: 'Monstruos',
  locations: 'Lugares',
  npcs: 'PNJs',
  factions: 'Facciones',
  lore: 'Tradición',
  items: 'Objetos',
  spells: 'Hechizos',
};

// ---------------------------------------------------------------------------
// Inner form (used both standalone and embedded inside CronicaFeed sheet)
// ---------------------------------------------------------------------------

interface ComposerFormProps {
  worldId: string;
  refEntityKind?: string;
  refEntityId?: string;
  onClose: () => void;
  onSuccess?: (item?: FeedItem) => void;
}

function ComposerForm({ worldId, refEntityKind, refEntityId, onClose, onSuccess }: ComposerFormProps) {
  const [body, setBody] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

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
      ...(refEntityKind ? { refEntityKind } : {}),
      ...(refEntityId ? { refEntityId } : {}),
      visibility: 'personal',
      tags: selectedTags,
    });

    setSubmitting(false);

    if (result.ok) {
      // Build a minimal FeedItem for optimistic update in CronicaFeed
      const feedItem: FeedItem = {
        id: result.data.id,
        source: 'gremio',
        title: null,
        body: trimmed,
        tags: selectedTags,
        sortAt: result.data.occurredAt,
        sealedStatus: null,
        visibility: result.data.visibility,
        refEntityKind: result.data.refEntityKind,
        refEntityId: result.data.refEntityId,
        authorUserId: result.data.authorUserId,
      };
      setBody('');
      setSelectedTags([]);
      onSuccess?.(feedItem);
    } else {
      setError(result.error ?? 'No se pudo guardar la nota.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Body textarea */}
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
          placeholder="Escribí tu nota…"
          rows={4}
          className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* Optional KNOWLEDGE_TAGS multi-select (REQ-GREM-CT-02, ADR-6) */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
          Etiquetas <span className="font-normal normal-case">(opcional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {KNOWLEDGE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              aria-pressed={selectedTags.includes(tag)}
              className={[
                'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px]',
                selectedTags.includes(tag)
                  ? 'bg-ink text-paper'
                  : 'bg-paper-soft text-ink-soft hover:bg-paper hover:text-ink',
              ].join(' ')}
            >
              {TAG_LABELS[tag] ?? tag}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 bg-paper py-2 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="min-h-[44px] flex-1 rounded-md border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="min-h-[44px] flex-1 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {submitting ? 'Guardando…' : 'Guardar nota'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Standalone wrapper (original usage from codex entity detail — self-contained trigger + sheet)
// ---------------------------------------------------------------------------

export function ContributionComposer({
  worldId,
  refEntityKind,
  refEntityId,
  onClose,
  onSuccess,
}: ContributionComposerProps) {
  const [open, setOpen] = useState(false);

  // If onClose/onSuccess are provided externally (e.g. from CronicaFeed), the
  // sheet is controlled by the parent (composerOpen state lives there).
  // If not, this component manages its own open state (original codex usage).
  const isControlled = onClose !== undefined;

  function handleClose() {
    setOpen(false);
    onClose?.();
  }

  // Controlled mode: render only the form (parent manages sheet)
  if (isControlled) {
    return (
      <ComposerForm
        worldId={worldId}
        refEntityKind={refEntityKind}
        refEntityId={refEntityId}
        onClose={handleClose}
        onSuccess={onSuccess}
      />
    );
  }

  // Standalone mode: trigger button + self-managed sheet (original codex entity usage)
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

      <V3Sheet open={open} onClose={() => setOpen(false)} title="Nueva nota">
        <ComposerForm
          worldId={worldId}
          refEntityKind={refEntityKind}
          refEntityId={refEntityId}
          onClose={() => setOpen(false)}
          onSuccess={(item) => {
            onSuccess?.(item);
            setOpen(false);
          }}
        />
      </V3Sheet>
    </>
  );
}
