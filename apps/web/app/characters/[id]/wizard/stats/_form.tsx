'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveStats } from './actions';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';
import { Pill } from '@/components/ui';
import { nextValueForTile } from '@/lib/stat-tile-cycle';
import type { NullableScores, AbilityKey } from '@/lib/stat-tile-cycle';

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

type Method = 'standard-array' | 'point-buy' | 'roll';
type Scores = { str: number; dex: number; con: number; int: number; wis: number; cha: number };

const ABILITIES: Array<{ key: keyof Scores; label: string; abbr: string }> = [
  { key: 'str', label: 'Fuerza',        abbr: 'FUE' },
  { key: 'dex', label: 'Destreza',      abbr: 'DES' },
  { key: 'con', label: 'Constitución',  abbr: 'CON' },
  { key: 'int', label: 'Inteligencia',  abbr: 'INT' },
  { key: 'wis', label: 'Sabiduría',     abbr: 'SAB' },
  { key: 'cha', label: 'Carisma',       abbr: 'CAR' },
];

const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
const POINT_BUY_BUDGET = 27;

const METHOD_LABEL: Record<Method, string> = {
  'standard-array': 'Estándar',
  'point-buy':      'Puntos',
  'roll':           'Tirada',
};

const DEFAULTS: Record<Method, Scores> = {
  'standard-array': { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  'point-buy':      { str: 8,  dex: 8,  con: 8,  int: 8,  wis: 8,  cha: 8  },
  'roll':           { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
};

const NULL_SCORES: NullableScores = {
  str: null, dex: null, con: null, int: null, wis: null, cha: null,
};

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function d6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ---------------------------------------------------------------------------

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

  const standardArrayValid = useMemo(() => {
    if (!allTilesAssigned) return false;
    const sorted = [...ABILITIES.map((a) => tileScores[a.key] as number)].sort((a, b) => b - a);
    return sorted.every((v, i) => v === STANDARD_ARRAY[i]);
  }, [tileScores, allTilesAssigned]);

  const pointBuyValid = useMemo(() => {
    const totalCost = ABILITIES.reduce((sum, a) => sum + (POINT_BUY_COST[scores[a.key]] ?? 0), 0);
    return totalCost <= POINT_BUY_BUDGET && totalCost >= 0;
  }, [scores]);

  const canContinue =
    method === 'standard-array'
      ? standardArrayValid
      : method === 'point-buy'
        ? pointBuyValid
        : true;

  function handleSubmit() {
    setError(null);
    const finalScores: Scores =
      method === 'standard-array' ? (tileScores as Scores) : scores;
    startTransition(async () => {
      const res = await saveStats(characterId, method, finalScores);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Method tabs ─────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-pill bg-paper-soft p-1" role="tablist">
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
                ? 'bg-ink text-paper'
                : 'text-ink-mute font-medium hover:text-ink',
            ].join(' ')}
          >
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>

      {/* ── Method content ─────────────────────────────────────── */}
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

      {error && <p className="text-sm text-warning-deep">{error}</p>}

      <WizardFooterNav
        onNext={handleSubmit}
        pending={pending}
        disabled={!canContinue}
      />
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
    <div className="space-y-3">
      {/* Violet header card */}
      <div className="flex items-center justify-between rounded-md bg-gradient-to-br from-ink-soft to-ink px-4 py-3 ring-1 ring-ink/30">
        <span className="text-[10px] font-bold uppercase tracking-widest text-paper/60">
          Puntos restantes
        </span>
        <span className="font-display text-2xl font-bold text-paper">
          {remaining}
          <span className="ml-1 text-sm font-normal text-paper/50">/27</span>
        </span>
      </div>

      {/* Ability rows */}
      <div className="space-y-2">
        {ABILITIES.map((a) => {
          const v = scores[a.key];
          const cost = POINT_BUY_COST[v] ?? 0;
          const canInc = v < 15 && ((POINT_BUY_COST[v + 1] ?? 99) - cost) <= remaining;
          const canDec = v > 8;

          return (
            <div
              key={a.key}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-2.5"
            >
              {/* Ability name + cost */}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-ink">{a.label}</span>
                <span className="text-[11px] text-ink-mute">{cost} pts</span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`Reducir ${a.abbr}`}
                  onClick={() => dec(a.key)}
                  disabled={!canDec}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper-soft text-base text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-30"
                >
                  −
                </button>
                <span className="font-display w-7 text-center text-[22px] font-bold leading-none text-ink">
                  {v}
                </span>
                <button
                  type="button"
                  aria-label={`Aumentar ${a.abbr}`}
                  onClick={() => inc(a.key)}
                  disabled={!canInc}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper-soft text-base text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard Array editor
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
    <div className="space-y-3">
      {/* Violet header card */}
      <div className="flex items-center justify-between rounded-md bg-gradient-to-br from-ink-soft to-ink px-4 py-3 ring-1 ring-ink/30">
        <span className="text-[10px] font-bold uppercase tracking-widest text-paper/60">
          Arreglo estándar
        </span>
        <span className="font-display text-sm font-bold text-paper/80 tracking-wide">
          15 · 14 · 13 · 12 · 10 · 8
        </span>
      </div>

      {/* Hint */}
      <p className="text-xs text-ink-mute">
        Tocá un atributo para reasignar un valor del arreglo.
      </p>

      {/* Ability rows */}
      <div className="space-y-2">
        {ABILITIES.map((a) => {
          const v = tileScores[a.key];
          const assigned = v !== null;
          const isLast = lastSelected === a.key;
          const mod = assigned ? modifier(v!) : null;

          return (
            <div
              key={a.key}
              className={[
                'flex items-center justify-between rounded-md border px-4 py-2.5 transition-all',
                isLast
                  ? 'bg-accent-soft border-accent shadow-[0_0_0_1px_var(--color-accent)]'
                  : 'bg-surface border-line',
              ].join(' ')}
            >
              {/* Ability name */}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-ink">{a.label}</span>
                <span className="text-[11px] text-ink-mute">Tocá para cambiar</span>
              </div>

              {/* Modifier pill + score + arrow button */}
              <div className="flex items-center gap-2">
                {assigned && mod && (
                  <Pill tone="green" size="sm">{mod}</Pill>
                )}
                <span className="font-display w-7 text-center text-[22px] font-bold leading-none text-ink">
                  {assigned ? v : '—'}
                </span>
                <button
                  type="button"
                  aria-label={`${a.abbr} assign value`}
                  onClick={() => onTileTap(a.key)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-primary text-paper text-sm transition hover:brightness-110 active:scale-95"
                >
                  ↻
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {hasDuplicates && (
        <p className="text-xs text-warning-deep">
          Hay valores duplicados — cada valor debe usarse exactamente una vez.
        </p>
      )}
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
  const total = useMemo(
    () => ABILITIES.reduce((sum, a) => sum + scores[a.key], 0),
    [scores],
  );

  function rollAll() {
    for (const a of ABILITIES) {
      const rolls = [d6(), d6(), d6(), d6()].sort((x, y) => x - y).slice(1);
      const value = rolls.reduce((s, r) => s + r, 0);
      setScore(a.key, value);
    }
  }

  return (
    <div className="space-y-3">
      {/* Peach gradient header card */}
      <div className="flex items-center justify-between rounded-md bg-gradient-to-br from-accent to-secondary px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-paper/80">
          🎲 4D6 (quitar el menor)
        </span>
        <span className="font-display text-lg font-bold text-paper">
          Suma {total}
        </span>
      </div>

      {/* 3×2 grid of compact ability tiles */}
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.map((a) => {
          const v = scores[a.key];
          const mod = modifier(v);
          return (
            <div
              key={a.key}
              className="flex flex-col items-center justify-center gap-1 rounded-md border border-line bg-surface py-3 px-2"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-mute">
                {a.abbr}
              </span>
              <span className="font-display text-[28px] font-bold leading-none text-ink">
                {v}
              </span>
              <Pill tone="green" size="sm">{mod}</Pill>
            </div>
          );
        })}
      </div>

      {/* Re-roll button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={rollAll}
          className="rounded-pill border border-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:bg-paper-soft"
        >
          🎲 Volver a tirar
        </button>
      </div>

      {/* Audit note */}
      <p className="text-center text-[11px] text-ink-mute leading-snug">
        La tirada es aleatoria — guardá la que más te guste. El DM podrá auditarla.
      </p>
    </div>
  );
}
