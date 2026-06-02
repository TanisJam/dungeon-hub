'use client';

// NpcForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-NPC-01: fields: name (required), race, status select, description, dmNotes.
// REQ-GATE-03: mobile-first, ≥44px inputs.

import { useState } from 'react';
import type { NpcRow, NpcBody, NpcStatus } from '@/app/codex/actions';

interface NpcFormProps {
  mode: 'create' | 'edit';
  initial: NpcRow | null;
  onSubmit: (body: NpcBody) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}

const STATUSES: { value: NpcStatus; label: string }[] = [
  { value: 'alive', label: 'Vivo' },
  { value: 'dead', label: 'Muerto' },
  { value: 'missing', label: 'Desaparecido' },
  { value: 'unknown', label: 'Desconocido' },
];

export function NpcForm({ mode, initial, onSubmit, onDone }: NpcFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [race, setRace] = useState(initial?.race ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dmNotes, setDmNotes] = useState(initial?.dmNotes ?? '');
  const [status, setStatus] = useState<NpcStatus>(initial?.status ?? 'alive');
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

    const body: NpcBody = {
      name: name.trim(),
      race: race.trim() || undefined,
      description: description.trim() || undefined,
      dmNotes: dmNotes.trim() || undefined,
      status,
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
        <label htmlFor="npc-name" className={labelClass}>
          Nombre <span aria-hidden="true">*</span>
        </label>
        <input
          id="npc-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del NPC"
          required
          className={inputClass}
        />
      </div>

      {/* Race */}
      <div>
        <label htmlFor="npc-race" className={labelClass}>
          Raza
        </label>
        <input
          id="npc-race"
          type="text"
          value={race}
          onChange={(e) => setRace(e.target.value)}
          placeholder="Humano, Elfo, Enano…"
          className={inputClass}
        />
      </div>

      {/* Status */}
      <div>
        <label htmlFor="npc-status" className={labelClass}>
          Estado
        </label>
        <select
          id="npc-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as NpcStatus)}
          className={inputClass}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="npc-description" className={labelClass}>
          Descripción
        </label>
        <textarea
          id="npc-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción del NPC…"
          rows={3}
          className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* dmNotes (DM-only form field) */}
      <div>
        <label htmlFor="npc-dm-notes" className={labelClass}>
          Notas del DM
        </label>
        <textarea
          id="npc-dm-notes"
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
        {submitting ? 'Guardando…' : mode === 'create' ? 'Crear NPC' : 'Guardar cambios'}
      </button>
    </form>
  );
}
