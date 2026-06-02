'use client';

// FactionForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-FAC-03: fields: name (required), description, state select, dmNotes.
// REQ-GATE-03: mobile-first, ≥44px inputs.

import { useState } from 'react';
import type { FactionRow, FactionBody, FactionState } from '@/app/codex/actions';

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

      {/* Name (required) */}
      <div>
        <label htmlFor="faction-name" className={labelClass}>
          Nombre <span aria-hidden="true">*</span>
        </label>
        <input
          id="faction-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la facción"
          required
          className={inputClass}
        />
      </div>

      {/* State */}
      <div>
        <label htmlFor="faction-state" className={labelClass}>
          Estado
        </label>
        <select
          id="faction-state"
          value={state}
          onChange={(e) => setState(e.target.value as FactionState)}
          className={inputClass}
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
        <label htmlFor="faction-description" className={labelClass}>
          Descripción
        </label>
        <textarea
          id="faction-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción de la facción…"
          rows={3}
          className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* dmNotes (DM-only form field) */}
      <div>
        <label htmlFor="faction-dm-notes" className={labelClass}>
          Notas del DM
        </label>
        <textarea
          id="faction-dm-notes"
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
        {submitting ? 'Guardando…' : mode === 'create' ? 'Crear facción' : 'Guardar cambios'}
      </button>
    </form>
  );
}
