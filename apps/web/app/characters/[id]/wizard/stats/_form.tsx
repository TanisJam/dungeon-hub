'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveStats } from './actions';
import { StatTile } from '@/components/wizard/stat-tile';
import { Button } from '@/components/ui';
import { nextValueForTile } from '@/lib/stat-tile-cycle';
import type { NullableScores, AbilityKey } from '@/lib/stat-tile-cycle';

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

type Method = 'standard-array' | 'point-buy' | 'roll';
type Scores = { str: number; dex: number; con: number; int: number; wis: number; cha: number };

const ABILITIES: Array<{ key: keyof Scores; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
const POINT_BUY_BUDGET = 27;

const METHOD_LABEL: Record<Method, string> = {
  'standard-array': 'Estándar',
  'point-buy': 'Puntos',
  'roll': 'Tirada',
};

const DEFAULTS: Record<Method, Scores> = {
  'standard-array': { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  'point-buy': { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
  'roll': { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
};

// Null baseline for standard array
const NULL_SCORES: NullableScores = { str: null, dex: null, con: null, int: null, wis: null, cha: null };

export function StatsForm({
  characterId,
  allowedMethods,
  initialMethod,
  initialScores,
}: {
  characterId: string;
  allowedMethods: Method[];
  initialMethod: Method;
  initialScores: Scores | null;
}) {
  const [method, setMethod] = useState<Method>(initialMethod);
  const [scores, setScores] = useState<Scores>(initialScores ?? DEFAULTS[initialMethod]);
  // For standard-array: nullable tiles
  const [tileScores, setTileScores] = useState<NullableScores>(() => {
    if (initialMethod === 'standard-array' && initialScores) {
      return initialScores as NullableScores;
    }
    return NULL_SCORES;
  });
  const [lastSelected, setLastSelected] = useState<AbilityKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function switchMethod(next: Method) {
    if (next === method) return;
    setMethod(next);
    setScores(DEFAULTS[next]);
    setTileScores(NULL_SCORES);
    setLastSelected(null);
    setError(null);
  }

  function handleTileTap(ability: AbilityKey) {
    setTileScores((prev: NullableScores) => {
      const next = nextValueForTile(prev, ability);
      return { ...prev, [ability]: next };
    });
    setLastSelected(ability);
  }

  function setScore(key: keyof Scores, value: number) {
    setScores((s) => ({ ...s, [key]: value }));
  }

  const allTilesAssigned = useMemo(
    () => Object.values(tileScores).every((v) => v !== null),
    [tileScores],
  );

  // For standard-array: validate uniqueness
  const standardArrayValid = useMemo(() => {
    if (!allTilesAssigned) return false;
    const sorted = [...ABILITIES.map((a) => tileScores[a.key] as number)].sort((a, b) => b - a);
    return sorted.every((v, i) => v === STANDARD_ARRAY[i]);
  }, [tileScores, allTilesAssigned]);

  // Point buy validation
  const pointBuyValid = useMemo(() => {
    const totalCost = ABILITIES.reduce((sum, a) => sum + (POINT_BUY_COST[scores[a.key]] ?? 0), 0);
    return totalCost <= POINT_BUY_BUDGET && totalCost >= 0;
  }, [scores]);

  const canContinue = method === 'standard-array'
    ? standardArrayValid
    : method === 'point-buy'
      ? pointBuyValid
      : true;

  function handleSubmit() {
    setError(null);
    const finalScores: Scores = method === 'standard-array'
      ? (tileScores as Scores)
      : scores;
    startTransition(async () => {
      const res = await saveStats(characterId, method, finalScores);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Method tabs */}
      <div className="flex gap-1.5 rounded-pill bg-paper-soft p-1" role="tablist">
        {allowedMethods.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => switchMethod(m)}
            className={[
              'flex-1 rounded-pill px-3 py-1.5 text-xs font-semibold transition-all',
              method === m
                ? 'bg-ink text-paper shadow-stamp-sm'
                : 'text-ink-mute hover:text-ink',
            ].join(' ')}
          >
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>

      {/* Method content */}
      <div>
        {method === 'standard-array' && (
          <StandardArrayEditor
            tileScores={tileScores}
            lastSelected={lastSelected}
            onTileTap={handleTileTap}
          />
        )}
        {method === 'point-buy' && (
          <PointBuyEditor scores={scores} setScore={setScore} />
        )}
        {method === 'roll' && (
          <RollEditor scores={scores} setScore={setScore} />
        )}
      </div>

      {/* Remaining tiles hint */}
      {method === 'standard-array' && !allTilesAssigned && (
        <p className="text-xs text-ink-mute">
          {Object.values(tileScores).filter((v) => v === null).length} valores sin asignar — tocá un cuadro para asignar.
        </p>
      )}

      {error && <p className="text-sm text-warning-deep">{error}</p>}

      <Button
        tone="green"
        size="md"
        onClick={handleSubmit}
        disabled={pending || !canContinue}
        className="w-full"
      >
        {pending ? 'Guardando…' : 'Guardar y seguir →'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard Array editor with StatTile
// ---------------------------------------------------------------------------

function StandardArrayEditor({
  tileScores,
  lastSelected,
  onTileTap,
}: {
  tileScores: NullableScores;
  lastSelected: AbilityKey | null;
  onTileTap: (ability: AbilityKey) => void;
}) {
  const usedValues = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const a of ABILITIES) {
      const v = tileScores[a.key];
      if (v !== null) counts[v] = (counts[v] ?? 0) + 1;
    }
    return counts;
  }, [tileScores]);

  const hasDuplicates = Object.values(usedValues).some((c) => c > 1);

  return (
    <div>
      <p className="mb-3 text-xs text-ink-mute">
        Tocá cada cuadro para asignar los valores: 15, 14, 13, 12, 10, 8.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.map((a) => (
          <StatTile
            key={a.key}
            ability={a.key}
            value={tileScores[a.key]}
            isLastSelected={lastSelected === a.key}
            onClick={() => onTileTap(a.key)}
          />
        ))}
      </div>
      {hasDuplicates && (
        <p className="mt-2 text-xs text-warning-deep">
          Hay valores duplicados — cada valor debe usarse exactamente una vez.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Point Buy editor
// ---------------------------------------------------------------------------

function PointBuyEditor({
  scores,
  setScore,
}: {
  scores: Scores;
  setScore: (k: keyof Scores, v: number) => void;
}) {
  const totalCost = useMemo(
    () => ABILITIES.reduce((sum, a) => sum + (POINT_BUY_COST[scores[a.key]] ?? 0), 0),
    [scores],
  );
  const remaining = POINT_BUY_BUDGET - totalCost;

  function inc(key: keyof Scores) {
    const v = scores[key];
    if (v >= 15) return;
    const cost = (POINT_BUY_COST[v + 1] ?? 0) - (POINT_BUY_COST[v] ?? 0);
    if (cost > remaining) return;
    setScore(key, v + 1);
  }
  function dec(key: keyof Scores) {
    const v = scores[key];
    if (v <= 8) return;
    setScore(key, v - 1);
  }

  return (
    <div>
      {/* Point pool indicator */}
      <div className={[
        'mb-4 flex items-center justify-between rounded-md px-4 py-3',
        remaining === 0
          ? 'bg-primary-soft border border-primary text-primary-deep'
          : remaining < 0
            ? 'bg-warning-soft border border-warning text-warning-deep'
            : 'bg-ink text-paper',
      ].join(' ')}>
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Puntos restantes
        </span>
        <span className="font-display text-2xl font-bold">{remaining}</span>
      </div>

      <div className="space-y-2">
        {ABILITIES.map((a) => {
          const v = scores[a.key];
          const cost = POINT_BUY_COST[v] ?? 0;
          return (
            <div
              key={a.key}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2"
            >
              <span className="font-mono text-sm font-bold text-ink">{a.label}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => dec(a.key)}
                  disabled={v <= 8}
                  className="grid h-7 w-7 place-items-center rounded-full bg-paper-soft border border-line text-sm hover:bg-surface disabled:opacity-30 transition"
                >
                  −
                </button>
                <span className="font-display w-7 text-center text-lg font-bold text-ink">{v}</span>
                <button
                  type="button"
                  onClick={() => inc(a.key)}
                  disabled={v >= 15 || (POINT_BUY_COST[v + 1] ?? 99) - cost > remaining}
                  className="grid h-7 w-7 place-items-center rounded-full bg-paper-soft border border-line text-sm hover:bg-surface disabled:opacity-30 transition"
                >
                  +
                </button>
                <span className="ml-1 text-[10px] text-ink-mute w-6 text-right">{cost}p</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roll editor
// ---------------------------------------------------------------------------

function RollEditor({
  scores,
  setScore,
}: {
  scores: Scores;
  setScore: (k: keyof Scores, v: number) => void;
}) {
  function rollAll() {
    for (const a of ABILITIES) {
      const rolls = [d6(), d6(), d6(), d6()].sort((x, y) => x - y).slice(1);
      const total = rolls.reduce((s, r) => s + r, 0);
      setScore(a.key, total);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-ink-mute">Cada valor en [3, 18] (4d6 drop lowest).</p>
        <button
          type="button"
          onClick={rollAll}
          className="rounded-pill border border-line px-3 py-1 text-xs text-ink-soft hover:bg-paper-soft transition"
        >
          🎲 Tirar todo
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.map((a) => (
          <label key={a.key} className="flex flex-col items-center gap-1 rounded-md border border-line bg-surface p-2">
            <span className="font-mono text-[10px] font-bold text-ink-mute">{a.label}</span>
            <input
              type="number"
              min={3}
              max={18}
              value={scores[a.key]}
              onChange={(e) => setScore(a.key, Math.max(3, Math.min(18, Number(e.target.value))))}
              className="w-full rounded border border-line bg-paper px-1 py-0.5 text-center font-mono text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function d6(): number {
  return Math.floor(Math.random() * 6) + 1;
}
