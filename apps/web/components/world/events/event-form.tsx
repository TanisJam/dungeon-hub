'use client';

// EventForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-CRO-02: fields: title (required), occurredAt (date), description, dmNotes,
//             visibility toggle (public|dm-only), tags (comma-separated input).
// REQ-GATE-03: mobile-first, ≥44px inputs.

import { useState } from 'react';
import type { EventRow, EventBody, EventVisibility } from '@/app/cronica/actions';

interface EventFormProps {
  mode: 'create' | 'edit';
  initial: EventRow | null;
  onSubmit: (body: EventBody) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}

const VISIBILITY_OPTIONS: { value: EventVisibility; label: string }[] = [
  { value: 'public', label: 'Público' },
  { value: 'dm-only', label: 'Solo DM' },
];

/** Convert ISO string to YYYY-MM-DD for <input type="date"> */
function toDateInput(iso: string): string {
  try {
    return iso.slice(0, 10);
  } catch {
    return '';
  }
}

/** Convert YYYY-MM-DD from <input type="date"> to ISO string */
function toIso(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  return new Date(dateStr + 'T00:00:00Z').toISOString();
}

export function EventForm({ mode, initial, onSubmit, onDone }: EventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dmNotes, setDmNotes] = useState(initial?.dmNotes ?? '');
  const [occurredAt, setOccurredAt] = useState(
    initial?.occurredAt ? toDateInput(initial.occurredAt) : toDateInput(new Date().toISOString()),
  );
  const [visibility, setVisibility] = useState<EventVisibility>(
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

    const body: EventBody = {
      title: title.trim(),
      description: description.trim() || undefined,
      dmNotes: dmNotes.trim() || undefined,
      occurredAt: toIso(occurredAt),
      visibility,
      tags,
    };

    const result = await onSubmit(body);
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
        <label htmlFor="event-title" className={labelClass}>
          Título <span aria-hidden="true">*</span>
        </label>
        <input
          id="event-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título del evento"
          required
          className={inputClass}
        />
      </div>

      {/* occurredAt (date) */}
      <div>
        <label htmlFor="event-occurred-at" className={labelClass}>
          Fecha
        </label>
        <input
          id="event-occurred-at"
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Visibility */}
      <div>
        <label htmlFor="event-visibility" className={labelClass}>
          Visibilidad
        </label>
        <select
          id="event-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as EventVisibility)}
          className={inputClass}
        >
          {VISIBILITY_OPTIONS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="event-description" className={labelClass}>
          Descripción
        </label>
        <textarea
          id="event-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción del evento…"
          rows={3}
          className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* Tags (comma-separated) */}
      <div>
        <label htmlFor="event-tags" className={labelClass}>
          Etiquetas (separadas por comas)
        </label>
        <input
          id="event-tags"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="session-1, combate, historia…"
          className={inputClass}
        />
      </div>

      {/* dmNotes (DM-only form field) */}
      <div>
        <label htmlFor="event-dm-notes" className={labelClass}>
          Notas del DM
        </label>
        <textarea
          id="event-dm-notes"
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
          placeholder="Notas privadas del DM…"
          rows={3}
          className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-ink/80 disabled:opacity-50"
      >
        {submitting ? 'Guardando…' : mode === 'create' ? 'Crear evento' : 'Guardar cambios'}
      </button>
    </form>
  );
}
