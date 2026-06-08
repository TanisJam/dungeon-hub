'use client';

// JournalForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-CRO-03: fields: title (required), body (plain text textarea), visibility toggle,
//             tags (comma-separated input).
// ADR-3: body is plain text — textarea write, whitespace-pre-wrap read. No markdown.
// REQ-GATE-03: mobile-first, ≥44px inputs.
// B1 refactor: replaced inline inputClass/labelClass/error/submit with ui/ primitives.

import { useState } from 'react';
import type { JournalRow, JournalBody, JournalVisibility } from '@/app/bitacora/actions';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

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

const selectClass =
  'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormErrorAlert message={error} />

      {/* Title (required) */}
      <div>
        <FormLabel htmlFor="journal-title" required>
          Título
        </FormLabel>
        <FormInput
          id="journal-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la nota"
          required
        />
      </div>

      {/* Visibility — select stays inline (FormSelect deferred per B1 scope decision) */}
      <div>
        <FormLabel htmlFor="journal-visibility">Visibilidad</FormLabel>
        <select
          id="journal-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as JournalVisibility)}
          className={selectClass}
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
        <FormLabel htmlFor="journal-body">Contenido</FormLabel>
        <FormInput
          id="journal-body"
          multiline
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe el contenido de la nota…"
          rows={6}
        />
      </div>

      {/* Tags (comma-separated) */}
      <div>
        <FormLabel htmlFor="journal-tags">Etiquetas (separadas por comas)</FormLabel>
        <FormInput
          id="journal-tags"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="session-1, trama, secreto…"
        />
      </div>

      {/* Submit */}
      <FormSubmitButton
        pending={submitting}
        idleLabel={mode === 'create' ? 'Crear nota' : 'Guardar cambios'}
      />
    </form>
  );
}
