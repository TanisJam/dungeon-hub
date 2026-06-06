'use client';

/**
 * BitacoraComposer — bottom-sheet composer for creating and editing personal pages.
 *
 * Reuses V3Sheet bottom-sheet pattern (tap-outside-to-close, mobile-first 375px).
 * Fields: optional title, required body textarea, tag multi-select (KNOWLEDGE_TAGS pills),
 * optional monster ref picker (from known monsters — known-only for discoverability).
 *
 * NOTE: The monster ref picker sources from the player's KNOWN monsters only (Conocidos
 * gate) — this is a UI discoverability decision. The API and domain do NOT restrict refs
 * to known monsters; a page referencing an unknown monster is valid at the API layer.
 *
 * bitacora-personal SDD spec #1974 REQ-BP-WEB-04, design #1975 §ADR-5.
 * No PHB rule — anti-metagaming design principle.
 */

import { useState } from 'react';
import { KNOWLEDGE_TAGS } from '@dungeon-hub/domain/world/codex';
import { V3Sheet } from '@/components/ui';
import { createBitacoraPage, updateBitacoraPage } from '../../actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnownMonster {
  slug: string;
  source: string;
  name: string;
}

export interface BitacoraPageRef {
  kind: string;
  refKey: string;
  refSource: string;
}

export interface BitacoraPageData {
  id: string;
  title?: string | null;
  body: string;
  tags: string[];
  refs: BitacoraPageRef[];
}

interface BitacoraComposerProps {
  characterId: string;
  knownMonsters: KnownMonster[];
  // When provided, composer opens in edit mode
  editPage?: BitacoraPageData;
  // Pre-populate with a monster ref (from Conocidos detail shortcut)
  prefilledRef?: { kind: string; refKey: string; refSource: string };
  onClose: () => void;
  open: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BitacoraComposer({
  characterId,
  knownMonsters,
  editPage,
  prefilledRef,
  onClose,
  open,
}: BitacoraComposerProps) {
  const isEditMode = !!editPage;

  const [title, setTitle] = useState(editPage?.title ?? '');
  const [body, setBody] = useState(editPage?.body ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(editPage?.tags ?? []);
  const [selectedRef, setSelectedRef] = useState<BitacoraPageRef | null>(
    editPage?.refs[0] ?? prefilledRef ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleTagToggle(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function handleRefChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (!val) {
      setSelectedRef(null);
      return;
    }
    const [refKey, refSource] = val.split('|');
    if (refKey && refSource) {
      setSelectedRef({ kind: 'monster', refKey, refSource });
    }
  }

  function handleClose() {
    setError(null);
    setFieldErrors({});
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    const refs = selectedRef ? [selectedRef] : [];

    let result;
    if (isEditMode && editPage) {
      result = await updateBitacoraPage(characterId, editPage.id, {
        title: title.trim() || null,
        body: trimmedBody,
        tags: selectedTags,
        refs,
      });
    } else {
      result = await createBitacoraPage(characterId, {
        title: title.trim() || null,
        body: trimmedBody,
        tags: selectedTags,
        refs,
      });
    }

    setSubmitting(false);

    if (result.ok) {
      handleClose();
    } else {
      // Map domain issues to field errors
      const newFieldErrors: Record<string, string> = {};
      let generalError: string | null = null;

      if ('issues' in result && Array.isArray(result.issues)) {
        for (const issue of result.issues as Array<{ code: string; message: string; path?: string }>) {
          if (issue.path === 'body' || issue.code === 'BITACORA_PAGE_BODY_REQUIRED') {
            newFieldErrors['body'] = issue.message;
          } else if (issue.path === 'tags' || issue.code?.startsWith('BITACORA_PAGE_TAG')) {
            newFieldErrors['tags'] = issue.message;
          } else {
            generalError = issue.message;
          }
        }
      } else if ('error' in result) {
        generalError = (result as { error: string }).error;
      }

      setFieldErrors(newFieldErrors);
      setError(generalError);
    }
  }

  const title_label = isEditMode ? 'Editar página' : 'Nueva página';
  const submitLabel = submitting ? 'Guardando…' : isEditMode ? 'Guardar cambios' : 'Crear página';

  return (
    <V3Sheet open={open} onClose={handleClose} title={title_label}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Title — optional */}
        <div>
          <label
            htmlFor="bp-title"
            className="block text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1"
          >
            Título{' '}
            <span className="text-ink-soft font-normal normal-case">(opcional)</span>
          </label>
          <input
            id="bp-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sin título"
            maxLength={120}
            className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
        </div>

        {/* Body — required */}
        <div>
          <label
            htmlFor="bp-body"
            className="block text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1"
          >
            Notas
          </label>
          <textarea
            id="bp-body"
            data-autofocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribí tus notas…"
            rows={5}
            maxLength={10000}
            className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
          {fieldErrors['body'] && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {fieldErrors['body']}
            </p>
          )}
        </div>

        {/* Tags */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
            Etiquetas
          </p>
          <div className="flex flex-wrap gap-2">
            {KNOWLEDGE_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagToggle(tag)}
                  className={[
                    'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
                    active
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {fieldErrors['tags'] && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {fieldErrors['tags']}
            </p>
          )}
        </div>

        {/* Monster ref picker — known monsters only (discoverability gate)
            NOTE: API/domain accept refs to any monster; UI restricts to known for UX. */}
        {knownMonsters.length > 0 && (
          <div>
            <label
              htmlFor="bp-ref"
              className="block text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1"
            >
              Monstruo relacionado{' '}
              <span className="text-ink-soft font-normal normal-case">(opcional)</span>
            </label>
            <select
              id="bp-ref"
              value={selectedRef ? `${selectedRef.refKey}|${selectedRef.refSource}` : ''}
              onChange={handleRefChange}
              className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
            >
              <option value="">Sin monstruo</option>
              {knownMonsters.map((m) => (
                <option key={`${m.slug}|${m.source}`} value={`${m.slug}|${m.source}`}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
            {submitLabel}
          </button>
        </div>
      </form>
    </V3Sheet>
  );
}
