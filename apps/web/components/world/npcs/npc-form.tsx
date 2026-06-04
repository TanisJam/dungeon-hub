'use client';

// NpcForm — DM-only create/edit form rendered inside V3Sheet.
// REQ-NPC-01: fields: name (required), race, status select, description, dmNotes.
// REQ-GATE-03: mobile-first, ≥44px inputs.
// B1 refactor: replaced inline inputClass/labelClass/error/submit with ui/ primitives.

import { useState } from 'react';
import type { NpcRow, NpcBody, NpcStatus } from '@/app/codex/actions';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

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

const selectClass =
  'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20';

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormErrorAlert message={error} />

      {/* Name (required) */}
      <div>
        <FormLabel htmlFor="npc-name" required>
          Nombre
        </FormLabel>
        <FormInput
          id="npc-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del NPC"
          required
        />
      </div>

      {/* Race */}
      <div>
        <FormLabel htmlFor="npc-race">Raza</FormLabel>
        <FormInput
          id="npc-race"
          type="text"
          value={race}
          onChange={(e) => setRace(e.target.value)}
          placeholder="Humano, Elfo, Enano…"
        />
      </div>

      {/* Status — select stays inline (FormSelect deferred per B1 scope decision) */}
      <div>
        <FormLabel htmlFor="npc-status">Estado</FormLabel>
        <select
          id="npc-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as NpcStatus)}
          className={selectClass}
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
        <FormLabel htmlFor="npc-description">Descripción</FormLabel>
        <FormInput
          id="npc-description"
          multiline
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción del NPC…"
          rows={3}
        />
      </div>

      {/* dmNotes (DM-only form field) */}
      <div>
        <FormLabel htmlFor="npc-dm-notes">Notas del DM</FormLabel>
        <FormInput
          id="npc-dm-notes"
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
        idleLabel={mode === 'create' ? 'Crear NPC' : 'Guardar cambios'}
      />
    </form>
  );
}
