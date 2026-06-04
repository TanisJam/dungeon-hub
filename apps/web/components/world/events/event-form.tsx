'use client';

// EventForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-CRO-02: fields: title (required), occurredAt (date), description, dmNotes,
//             visibility toggle (public|dm-only), tags (comma-separated input).
// REQ-GATE-03: mobile-first, ≥44px inputs.
// B1 refactor: replaced inline inputClass/labelClass/error/submit with ui/ primitives.

import { useState } from 'react';
import type { EventRow, EventBody, EventVisibility } from '@/app/cronica/actions';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

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

const selectClass =
  'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormErrorAlert message={error} />

      {/* Title (required) */}
      <div>
        <FormLabel htmlFor="event-title" required>
          Título
        </FormLabel>
        <FormInput
          id="event-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título del evento"
          required
        />
      </div>

      {/* occurredAt (date) */}
      <div>
        <FormLabel htmlFor="event-occurred-at">Fecha</FormLabel>
        <FormInput
          id="event-occurred-at"
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </div>

      {/* Visibility — select stays inline (FormSelect deferred per B1 scope decision) */}
      <div>
        <FormLabel htmlFor="event-visibility">Visibilidad</FormLabel>
        <select
          id="event-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as EventVisibility)}
          className={selectClass}
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
        <FormLabel htmlFor="event-description">Descripción</FormLabel>
        <FormInput
          id="event-description"
          multiline
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción del evento…"
          rows={3}
        />
      </div>

      {/* Tags (comma-separated) */}
      <div>
        <FormLabel htmlFor="event-tags">Etiquetas (separadas por comas)</FormLabel>
        <FormInput
          id="event-tags"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="session-1, combate, historia…"
        />
      </div>

      {/* dmNotes (DM-only form field) */}
      <div>
        <FormLabel htmlFor="event-dm-notes">Notas del DM</FormLabel>
        <FormInput
          id="event-dm-notes"
          multiline
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
          placeholder="Notas privadas del DM…"
          rows={3}
        />
      </div>

      {/* Submit */}
      <FormSubmitButton
        pending={submitting}
        idleLabel={mode === 'create' ? 'Crear evento' : 'Guardar cambios'}
      />
    </form>
  );
}
