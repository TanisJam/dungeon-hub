'use client';

// JournalForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-CRO-03: fields: title (required), body (plain text textarea), visibility toggle,
//             tags (comma-separated input).
// ADR-3: body is plain text — textarea write, whitespace-pre-wrap read. No markdown.
// REQ-GATE-03: mobile-first, ≥44px inputs.

import { useState } from 'react';
import type { JournalRow, JournalBody, JournalVisibility } from '@/app/cronica/actions';

interface JournalFormProps {
  mode: 'create' | 'edit';
  initial: JournalRow | null;
  onSubmit: (body: JournalBody) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}

const VISIBILITY_OPTIONS: { value: JournalVisibility; label: string }[] = [
  { value: 'public', label: 'Público' },
  { value: 'dm-only', label: 'Solo DM' },
];

export function JournalForm({ mode, initial, onSubmit, onDone }: JournalFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [visibility, setVisibility] = useState<JournalVisibility>(
    initial?.visibility ?? 'public',
  );
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(', '));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: JournalBody = {
      title: title.trim(),
      body: body.trim() || undefined,
      visibility,
      tags,
    };

    const result = await onSubmit(payload);
    setSubmitting(false);

    if (result.ok) {
      onDone();
    } else {
      setError(result.error ?? 'Error al guardar.');
    }
  }

  const inputClass =
    'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';
  const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Title (required) */}
      <div>
        <label htmlFor="journal-title" className={labelClass}>
          Título <span aria-hidden="true">*</span>
        </label>
        <input
          id="journal-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la nota"
          required
          className={inputClass}
        />
      </div>

      {/* Visibility */}
      <div>
        <label htmlFor="journal-visibility" className={labelClass}>
          Visibilidad
        </label>
        <select
          id="journal-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as JournalVisibility)}
          className={inputClass}
        >
          {VISIBILITY_OPTIONS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Body — plain text only (ADR-3) */}
      <div>
        <label htmlFor="journal-body" className={labelClass}>
          Contenido
        </label>
        <textarea
          id="journal-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe el contenido de la nota…"
          rows={6}
          className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* Tags (comma-separated) */}
      <div>
        <label htmlFor="journal-tags" className={labelClass}>
          Etiquetas (separadas por comas)
        </label>
        <input
          id="journal-tags"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="session-1, trama, secreto…"
          className={inputClass}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-ink/80 disabled:opacity-50"
      >
        {submitting ? 'Guardando…' : mode === 'create' ? 'Crear nota' : 'Guardar cambios'}
      </button>
    </form>
  );
}
