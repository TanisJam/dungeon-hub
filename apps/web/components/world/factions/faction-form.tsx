'use client';

// FactionForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-FAC-03: fields: name (required), description, state select, dmNotes.
// REQ-GATE-03: mobile-first, ≥44px inputs.
// B1 refactor: replaced inline inputClass/labelClass/error/submit with ui/ primitives.

import { useState } from 'react';
import type { FactionRow, FactionBody, FactionState } from '@/app/codex/actions';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

interface FactionFormProps {
  mode: 'create' | 'edit';
  initial: FactionRow | null;
  onSubmit: (body: FactionBody) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}

const STATES: { value: FactionState; label: string }[] = [
  { value: 'active', label: 'Activa' },
  { value: 'dormant', label: 'Dormida' },
  { value: 'destroyed', label: 'Destruida' },
  { value: 'disbanded', label: 'Disuelta' },
];

const selectClass =
  'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';

export function FactionForm({ mode, initial, onSubmit, onDone }: FactionFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dmNotes, setDmNotes] = useState(initial?.dmNotes ?? '');
  const [state, setState] = useState<FactionState>(initial?.state ?? 'active');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const body: FactionBody = {
      name: name.trim(),
      description: description.trim() || undefined,
      dmNotes: dmNotes.trim() || undefined,
      state,
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

      {/* Name (required) */}
      <div>
        <FormLabel htmlFor="faction-name" required>
          Nombre
        </FormLabel>
        <FormInput
          id="faction-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la facción"
          required
        />
      </div>

      {/* State — select stays inline (FormSelect deferred per B1 scope decision) */}
      <div>
        <FormLabel htmlFor="faction-state">Estado</FormLabel>
        <select
          id="faction-state"
          value={state}
          onChange={(e) => setState(e.target.value as FactionState)}
          className={selectClass}
        >
          {STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <FormLabel htmlFor="faction-description">Descripción</FormLabel>
        <FormInput
          id="faction-description"
          multiline
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción de la facción…"
          rows={3}
        />
      </div>

      {/* dmNotes (DM-only form field) */}
      <div>
        <FormLabel htmlFor="faction-dm-notes">Notas del DM</FormLabel>
        <FormInput
          id="faction-dm-notes"
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
        idleLabel={mode === 'create' ? 'Crear facción' : 'Guardar cambios'}
      />
    </form>
  );
}
