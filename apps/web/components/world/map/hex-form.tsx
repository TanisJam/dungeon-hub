'use client';

// HexForm — DM-only create/edit form for hexes.
// Required fields: q, r (coordinates) — REQ-MAP-01 API constraint.
// Optional: name, terrain, status, dmNotes, playerNotes.
// REQ-MAP-01, REQ-GATE-03 (44px tap targets).
//
// B1 NORMALIZATION (VISUAL CHANGE — requires Mauricio 375px sign-off before merging):
//   - Labels now use canonical FormLabel (mb-1 block text-xs font-semibold uppercase tracking-wide
//     text-ink-soft). Previous hex-only style: block text-xs font-medium text-ink-soft (no mb-1,
//     no uppercase, no tracking-wide, font-medium not font-semibold). This is intentional
//     consolidation of drift, NOT a pure refactor. See discovery #1816, decision #1820.
//   - Inputs no longer use inline mt-1 spacing (replaced by FormLabel's mb-1).
//   - Error block now appears at TOP (before fields, after <form>) not at bottom.
//   - hover:bg-ink/90 → hover:bg-ink/80 (canonical hover matches other 4 forms).
//   - select stays inline (FormSelect deferred per B1 scope decision).

import { useState } from 'react';
import type { HexRow, HexBody, HexStatus } from '@/app/mapa/actions';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

const HEX_STATUSES: { value: HexStatus; label: string }[] = [
  { value: 'unexplored', label: 'Sin explorar' },
  { value: 'rumored', label: 'Rumoreada' },
  { value: 'explored', label: 'Explorada' },
  { value: 'cleared', label: 'Despejada' },
];

const selectClass =
  'min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20';

interface HexFormProps {
  mode: 'create' | 'edit';
  initial: HexRow | null;
  onSubmit: (body: HexBody) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}

export function HexForm({ mode, initial, onSubmit, onDone }: HexFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [terrain, setTerrain] = useState(initial?.terrain ?? '');
  const [status, setStatus] = useState<HexStatus>(initial?.status ?? 'unexplored');
  const [q, setQ] = useState<number>(initial?.q ?? 0);
  const [r, setR] = useState<number>(initial?.r ?? 0);
  const [dmNotes, setDmNotes] = useState(initial?.dmNotes ?? '');
  const [playerNotes, setPlayerNotes] = useState(initial?.playerNotes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: HexBody = {
      q,
      r,
      ...(name.trim() && { name: name.trim() }),
      ...(terrain.trim() && { terrain: terrain.trim() }),
      status,
      ...(dmNotes.trim() && { dmNotes: dmNotes.trim() }),
      ...(playerNotes.trim() && { playerNotes: playerNotes.trim() }),
    };

    try {
      const result = await onSubmit(body);
      if (result.ok) {
        onDone();
      } else {
        setError(result.error ?? 'Error al guardar');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormErrorAlert message={error} />

      {/* Coordinates — required */}
      <div className="flex gap-3">
        <div className="flex-1">
          <FormLabel htmlFor="hex-q" required>
            Coordenada Q
          </FormLabel>
          <FormInput
            id="hex-q"
            type="number"
            required
            value={q}
            onChange={(e) => setQ(Number(e.target.value))}
          />
        </div>
        <div className="flex-1">
          <FormLabel htmlFor="hex-r" required>
            Coordenada R
          </FormLabel>
          <FormInput
            id="hex-r"
            type="number"
            required
            value={r}
            onChange={(e) => setR(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <FormLabel htmlFor="hex-name">Nombre</FormLabel>
        <FormInput
          id="hex-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Valle de las Sombras"
        />
      </div>

      {/* Terrain */}
      <div>
        <FormLabel htmlFor="hex-terrain">Terreno</FormLabel>
        <FormInput
          id="hex-terrain"
          type="text"
          value={terrain}
          onChange={(e) => setTerrain(e.target.value)}
          placeholder="Ej: Bosque, Montaña, Llanura…"
        />
      </div>

      {/* Status — select stays inline (FormSelect deferred per B1 scope decision) */}
      <div>
        <FormLabel htmlFor="hex-status">Estado</FormLabel>
        <select
          id="hex-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as HexStatus)}
          className={selectClass}
        >
          {HEX_STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Player notes */}
      <div>
        <FormLabel htmlFor="hex-player-notes">Notas para jugadores</FormLabel>
        <FormInput
          id="hex-player-notes"
          multiline
          value={playerNotes}
          onChange={(e) => setPlayerNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* DM notes */}
      <div>
        <FormLabel htmlFor="hex-dm-notes">Notas del DM (privadas)</FormLabel>
        <FormInput
          id="hex-dm-notes"
          multiline
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Submit */}
      <FormSubmitButton
        pending={submitting}
        idleLabel={mode === 'create' ? 'Crear hex' : 'Guardar cambios'}
      />
    </form>
  );
}
