'use client';

// HexForm — DM-only create/edit form for hexes.
// Required fields: q, r (coordinates) — REQ-MAP-01 API constraint.
// Optional: name, terrain, status, dmNotes, playerNotes.
// REQ-MAP-01, REQ-GATE-03 (44px tap targets).

import { useState } from 'react';
import type { HexRow, HexBody, HexStatus } from '@/app/mapa/actions';

const HEX_STATUSES: { value: HexStatus; label: string }[] = [
  { value: 'unexplored', label: 'Sin explorar' },
  { value: 'rumored', label: 'Rumoreada' },
  { value: 'explored', label: 'Explorada' },
  { value: 'cleared', label: 'Despejada' },
];

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
      {/* Coordinates — required */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="hex-q" className="block text-xs font-medium text-ink-soft">
            Coordenada Q *
          </label>
          <input
            id="hex-q"
            type="number"
            required
            value={q}
            onChange={(e) => setQ(Number(e.target.value))}
            className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="hex-r" className="block text-xs font-medium text-ink-soft">
            Coordenada R *
          </label>
          <input
            id="hex-r"
            type="number"
            required
            value={r}
            onChange={(e) => setR(Number(e.target.value))}
            className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="hex-name" className="block text-xs font-medium text-ink-soft">
          Nombre
        </label>
        <input
          id="hex-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Valle de las Sombras"
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* Terrain */}
      <div>
        <label htmlFor="hex-terrain" className="block text-xs font-medium text-ink-soft">
          Terreno
        </label>
        <input
          id="hex-terrain"
          type="text"
          value={terrain}
          onChange={(e) => setTerrain(e.target.value)}
          placeholder="Ej: Bosque, Montaña, Llanura…"
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* Status */}
      <div>
        <label htmlFor="hex-status" className="block text-xs font-medium text-ink-soft">
          Estado
        </label>
        <select
          id="hex-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as HexStatus)}
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
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
        <label htmlFor="hex-player-notes" className="block text-xs font-medium text-ink-soft">
          Notas para jugadores
        </label>
        <textarea
          id="hex-player-notes"
          value={playerNotes}
          onChange={(e) => setPlayerNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* DM notes */}
      <div>
        <label htmlFor="hex-dm-notes" className="block text-xs font-medium text-ink-soft">
          Notas del DM (privadas)
        </label>
        <textarea
          id="hex-dm-notes"
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-ink/90 disabled:opacity-50"
      >
        {submitting ? 'Guardando…' : mode === 'create' ? 'Crear hex' : 'Guardar cambios'}
      </button>
    </form>
  );
}
