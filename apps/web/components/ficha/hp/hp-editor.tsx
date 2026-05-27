'use client';

import { useState, useTransition } from 'react';
import { saveHp } from './save-hp-action';

export type HpValues = {
  current: number;
  max: number;
  temp: number;
};

interface HPEditorProps {
  characterId: string;
  currentHp: HpValues;
  /** When true: DM mode — all three inputs editable, "DM Override" badge near max. */
  isDmHere: boolean;
  onClose: () => void;
}

/**
 * HPEditor — dual-mode HP form.
 * Player mode: current + temp editable; max read-only with hint text.
 * DM mode: all three fields editable; "DM Override" badge near max field.
 * Calls saveHp server action on submit.
 * Spec: sdd/ficha-dm-affordances #995 — HPEditor Component.
 */
export function HPEditor({ characterId, currentHp, isDmHere, onClose }: HPEditorProps) {
  const [current, setCurrent] = useState(String(currentHp.current));
  const [max, setMax] = useState(String(currentHp.max));
  const [temp, setTemp] = useState(String(currentHp.temp));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: { characterId: string; current?: number; max?: number; temp?: number } = {
      characterId,
      current: parseInt(current, 10),
      temp: parseInt(temp, 10),
    };
    if (isDmHere && max !== '') {
      payload.max = parseInt(max, 10);
    }

    startTransition(async () => {
      const result = await saveHp(payload);
      if (result.ok) {
        onClose();
      } else {
        setError(result.message ?? 'Error al guardar.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      {/* Current HP */}
      <div className="flex flex-col gap-1">
        <label htmlFor="hp-current" className="text-sm font-medium text-ink">
          HP actual
        </label>
        <input
          id="hp-current"
          type="number"
          aria-label="HP actual"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-ink"
        />
      </div>

      {/* Max HP */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label htmlFor="hp-max" className="text-sm font-medium text-ink">
            HP máximo
          </label>
          {isDmHere && (
            <span
              data-testid="dm-override-badge"
              className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-400"
            >
              DM Override
            </span>
          )}
        </div>
        {isDmHere ? (
          <input
            id="hp-max"
            type="number"
            aria-label="HP máximo"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-ink"
          />
        ) : (
          <>
            <input
              id="hp-max"
              type="number"
              aria-label="HP máximo"
              value={max}
              readOnly
              aria-readonly="true"
              className="rounded-md border border-line bg-surface/50 px-3 py-2 text-ink-mute cursor-not-allowed"
            />
            <p className="text-xs text-ink-mute">Solo el DM puede ajustar el máximo</p>
          </>
        )}
      </div>

      {/* Temp HP */}
      <div className="flex flex-col gap-1">
        <label htmlFor="hp-temp" className="text-sm font-medium text-ink">
          HP temporal
        </label>
        <input
          id="hp-temp"
          type="number"
          aria-label="HP temporal"
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-ink"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-line px-4 py-2 text-sm text-ink-soft"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
