'use client';

// NOTE: mirrors AtributosEditor (apps/web/components/ficha/atributos-editor.tsx)
// Dev-only catalog island — supplies fixture ability scores + stub/no-op handlers.
// saveAtributos server action is NOT called; form submit is intercepted and no-op'd.

import { useState, useTransition } from 'react';

type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

const ABILITIES: Array<{ key: keyof AbilityScores; abbr: string }> = [
  { key: 'str', abbr: 'FUE' },
  { key: 'dex', abbr: 'DES' },
  { key: 'con', abbr: 'CON' },
  { key: 'int', abbr: 'INT' },
  { key: 'wis', abbr: 'SAB' },
  { key: 'cha', abbr: 'CAR' },
];

interface Props {
  currentStats: AbilityScores;
  statusLocked: boolean;
  isDm: boolean;
}

export function AtributosEditorIsland({ currentStats, statusLocked, isDm }: Props) {
  const isEditable = !statusLocked || isDm;
  const [scores, setScores] = useState<AbilityScores>({ ...currentStats });
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChange(key: keyof AbilityScores, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num)) setScores((prev) => ({ ...prev, [key]: num }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditable) return;
    startTransition(async () => {
      // Catalog no-op: simulate save without server action
      await new Promise((r) => setTimeout(r, 400));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {statusLocked && !isDm && (
        <div
          role="alert"
          className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft"
        >
          Esta ficha está cerrada. Pedíle al DM que la devuelva.
        </div>
      )}

      {saved && (
        <div className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft">
          (Catálogo) Guardado localmente — sin acción de servidor real.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {ABILITIES.map(({ key, abbr }) => (
          <div key={key} className="flex flex-col gap-1">
            <label
              htmlFor={`catalog-stat-${key}`}
              className="text-[10px] font-bold uppercase tracking-wide text-ink-mute"
            >
              {abbr}
            </label>
            <input
              id={`catalog-stat-${key}`}
              type="number"
              min={1}
              max={30}
              value={scores[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              disabled={!isEditable}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-center font-display text-lg font-bold text-ink focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        {isEditable && (
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-[#1A1208] transition-opacity disabled:opacity-50"
          >
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        <button
          type="button"
          className="flex-1 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
