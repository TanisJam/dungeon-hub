'use client';

// QuestForm — GM-only create/edit form rendered inside V3Sheet.
// REQ-QUEST-WEB-PAGE-03: fields: title (required), description, dmNotes, status select, visibility select.
// REQ-GATE-03: mobile-first, ≥44px inputs.

import { useState } from 'react';
import type { QuestRow, QuestBody, QuestStatus, QuestVisibility } from '@/app/herramientas/quests/actions';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

interface QuestFormProps {
  mode: 'create' | 'edit';
  initial: QuestRow | null;
  onSubmit: (body: QuestBody) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}

const STATUS_OPTIONS: { value: QuestStatus; label: string }[] = [
  { value: 'available', label: 'Disponible' },
  { value: 'active', label: 'Activa' },
  { value: 'completed', label: 'Completada' },
  { value: 'abandoned', label: 'Abandonada' },
];

const VISIBILITY_OPTIONS: { value: QuestVisibility; label: string }[] = [
  { value: 'public', label: 'Público' },
  { value: 'dm-only', label: 'Solo DM' },
];

const selectClass =
  'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';

export function QuestForm({ mode, initial, onSubmit, onDone }: QuestFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dmNotes, setDmNotes] = useState(initial?.dmNotes ?? '');
  const [status, setStatus] = useState<QuestStatus>(initial?.status ?? 'available');
  const [visibility, setVisibility] = useState<QuestVisibility>(
    initial?.visibility ?? 'public',
  );
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

    const payload: QuestBody = {
      title: title.trim(),
      description: description.trim() || null,
      dmNotes: dmNotes.trim() || null,
      status,
      visibility,
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
        <FormLabel htmlFor="quest-title" required>
          Título
        </FormLabel>
        <FormInput
          id="quest-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la quest"
          required
        />
      </div>

      {/* Status select */}
      <div>
        <FormLabel htmlFor="quest-status">Estado</FormLabel>
        <select
          id="quest-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as QuestStatus)}
          className={selectClass}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Visibility select */}
      <div>
        <FormLabel htmlFor="quest-visibility">Visibilidad</FormLabel>
        <select
          id="quest-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as QuestVisibility)}
          className={selectClass}
        >
          {VISIBILITY_OPTIONS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description — plain text */}
      <div>
        <FormLabel htmlFor="quest-description">Descripción</FormLabel>
        <FormInput
          id="quest-description"
          multiline
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción de la quest…"
          rows={4}
        />
      </div>

      {/* DM Notes — private, GM-only */}
      <div>
        <FormLabel htmlFor="quest-dm-notes">Notas del DM (privado)</FormLabel>
        <FormInput
          id="quest-dm-notes"
          multiline
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
          placeholder="Notas privadas del DM…"
          rows={4}
        />
      </div>

      {/* Submit */}
      <FormSubmitButton
        pending={submitting}
        idleLabel={mode === 'create' ? 'Crear quest' : 'Guardar cambios'}
      />
    </form>
  );
}
