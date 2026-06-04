'use client';

// NOTE: mirrors HPEditor (apps/web/components/ficha/hp/hp-editor.tsx)
// Dev-only catalog island — supplies fixture HP values + stub/no-op handlers.
// saveHp server action is NOT called; form submit simulates save locally.
// PAIR ANALYSIS: HPEditor is the form body; HPSectionEditor is the pencil+V3Sheet wrapper.

import { useState, useTransition } from 'react';
import { FormErrorAlert } from '@/components/ui/form-error-alert';

export type HpValues = { current: number; max: number; temp: number };

interface Props {
  currentHp: HpValues;
  isDmHere: boolean;
}

export function HPEditorIsland({ currentHp, isDmHere }: Props) {
  const [current, setCurrent] = useState(String(currentHp.current));
  const [max, setMax] = useState(String(currentHp.max));
  const [temp, setTemp] = useState(String(currentHp.temp));
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 300));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-hp-current" className="text-sm font-medium text-ink">
          HP actual
        </label>
        <input
          id="catalog-hp-current"
          type="number"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-ink"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label htmlFor="catalog-hp-max" className="text-sm font-medium text-ink">
            HP máximo
          </label>
          {isDmHere && (
            <span
              className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-400"
            >
              DM Override
            </span>
          )}
        </div>
        {isDmHere ? (
          <input
            id="catalog-hp-max"
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-ink"
          />
        ) : (
          <>
            <input
              id="catalog-hp-max"
              type="number"
              value={max}
              readOnly
              aria-readonly="true"
              className="rounded-md border border-line bg-surface/50 px-3 py-2 text-ink-mute cursor-not-allowed"
            />
            <p className="text-xs text-ink-mute">Solo el DM puede ajustar el máximo</p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="catalog-hp-temp" className="text-sm font-medium text-ink">
          HP temporal
        </label>
        <input
          id="catalog-hp-temp"
          type="number"
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-ink"
        />
      </div>

      <FormErrorAlert message={saved ? '(Catálogo) Guardado localmente — sin servidor real.' : null} />

      <div className="flex gap-2">
        <button
          type="button"
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
