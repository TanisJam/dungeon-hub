'use client';

import { useState, useTransition } from 'react';
import { saveAtributos } from './save-atributos-action';

type Method = 'standard-array' | 'point-buy' | 'roll';

export type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

interface AtributosEditorProps {
  characterId: string;
  currentStats: AbilityScores;
  currentMethod: Method;
  /** Derived from char.status ∈ {active, retired, dead} — computed server-side. */
  statusLocked: boolean;
  /** Computed server-side: callerRole === 'gm'. DM bypasses lock. */
  isDm: boolean;
  onClose: () => void;
}

const ABILITIES: Array<{ key: keyof AbilityScores; label: string; abbr: string }> = [
  { key: 'str', label: 'Fuerza', abbr: 'FUE' },
  { key: 'dex', label: 'Destreza', abbr: 'DES' },
  { key: 'con', label: 'Constitución', abbr: 'CON' },
  { key: 'int', label: 'Inteligencia', abbr: 'INT' },
  { key: 'wis', label: 'Sabiduría', abbr: 'SAB' },
  { key: 'cha', label: 'Carisma', abbr: 'CAR' },
];

const DEFAULT_SCORE = 10;

/**
 * AtributosEditor — form body for editing the 6 ability scores.
 * Permission-aware: shows read-only mode + locked banner when statusLocked=true && isDm=false.
 * Design: sdd/ficha-restyle — ATRIBUTOS-EDITOR-01, ATRIBUTOS-EDITOR-POLICY-01.
 */
export function AtributosEditor({
  characterId,
  currentStats,
  currentMethod,
  statusLocked,
  isDm,
  onClose,
}: AtributosEditorProps) {
  const isEditable = !statusLocked || isDm;

  const [scores, setScores] = useState<AbilityScores>(() => ({
    str: currentStats?.str ?? DEFAULT_SCORE,
    dex: currentStats?.dex ?? DEFAULT_SCORE,
    con: currentStats?.con ?? DEFAULT_SCORE,
    int: currentStats?.int ?? DEFAULT_SCORE,
    wis: currentStats?.wis ?? DEFAULT_SCORE,
    cha: currentStats?.cha ?? DEFAULT_SCORE,
  }));

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(key: keyof AbilityScores, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setScores((prev) => ({ ...prev, [key]: num }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditable) return;
    setError(null);
    startTransition(async () => {
      const result = await saveAtributos(characterId, currentMethod, scores);
      if (result.ok) {
        onClose();
      } else {
        if (result.error === 'locked') {
          setError('Esta ficha está cerrada. Pedíle al DM que la devuelva.');
        } else {
          setError(result.message ?? 'Error al guardar. Intentá de nuevo.');
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Lock banner — shown when locked and not DM */}
      {statusLocked && !isDm && (
        <div
          role="alert"
          className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft"
        >
          Esta ficha está cerrada. Pedíle al DM que la devuelva.
        </div>
      )}

      {/* Error banner from server action */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft"
        >
          {error}
        </div>
      )}

      {/* 6 ability score inputs — 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        {ABILITIES.map(({ key, abbr }) => (
          <div key={key} className="flex flex-col gap-1">
            <label
              htmlFor={`stat-${key}`}
              className="text-[10px] font-bold uppercase tracking-wide text-ink-mute"
            >
              {abbr}
            </label>
            <input
              id={`stat-${key}`}
              aria-label={abbr}
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

      {/* Actions */}
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
          onClick={onClose}
          className="flex-1 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
