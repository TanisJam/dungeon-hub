'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveStats } from './actions';

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

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
const POINT_BUY_BUDGET = 27;

const DEFAULTS: Record<Method, Scores> = {
  'standard-array': { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  'point-buy': { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
  'roll': { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
};

const METHOD_LABEL: Record<Method, string> = {
  'standard-array': 'Standard Array',
  'point-buy': 'Point Buy',
  'roll': 'Roll',
};

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function switchMethod(next: Method) {
    if (next === method) return;
    setMethod(next);
    setScores(DEFAULTS[next]);
    setError(null);
  }

  function setScore(key: keyof Scores, value: number) {
    setScores((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await saveStats(characterId, method, scores);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div>
      <div className="flex gap-2" role="tablist">
        {allowedMethods.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => switchMethod(m)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${
              method === m
                ? 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30'
                : 'text-zinc-400 ring-zinc-800 hover:text-zinc-200 hover:ring-zinc-700'
            }`}
          >
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
        {method === 'standard-array' && (
          <StandardArrayEditor scores={scores} setScore={setScore} />
        )}
        {method === 'point-buy' && <PointBuyEditor scores={scores} setScore={setScore} />}
        {method === 'roll' && <RollEditor scores={scores} setScore={setScore} />}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
        >
          {pending ? 'Saving…' : 'Save & continue →'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

function StandardArrayEditor({
  scores,
  setScore,
}: {
  scores: Scores;
  setScore: (k: keyof Scores, v: number) => void;
}) {
  const usedCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const a of ABILITIES) c[scores[a.key]] = (c[scores[a.key]] ?? 0) + 1;
    return c;
  }, [scores]);

  const valid = useMemo(() => {
    const sorted = [...ABILITIES.map((a) => scores[a.key])].sort((a, b) => b - a);
    return sorted.every((v, i) => v === STANDARD_ARRAY[i]);
  }, [scores]);

  return (
    <div>
      <p className="text-xs text-zinc-500">
        Assign 15, 14, 13, 12, 10, 8 — each value exactly once.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ABILITIES.map((a) => (
          <label key={a.key} className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-zinc-400">{a.label}</span>
            <select
              value={scores[a.key]}
              onChange={(e) => setScore(a.key, Number(e.target.value))}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            >
              {STANDARD_ARRAY.map((v) => (
                <option key={v} value={v}>
                  {v}
                  {(usedCounts[v] ?? 0) > 1 && scores[a.key] === v ? ' (dup)' : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className={`mt-4 text-xs ${valid ? 'text-emerald-400' : 'text-amber-400'}`}>
        {valid ? '✓ Valid standard array.' : 'Each of 15/14/13/12/10/8 must be used exactly once.'}
      </p>
    </div>
  );
}

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
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">Scores 8–15, budget 27 (PHB).</p>
        <p
          className={`text-sm font-medium ${
            remaining === 0
              ? 'text-emerald-400'
              : remaining < 0
                ? 'text-red-400'
                : 'text-zinc-300'
          }`}
        >
          {remaining} pts remaining
        </p>
      </div>
      <div className="mt-4 space-y-2">
        {ABILITIES.map((a) => {
          const v = scores[a.key];
          const cost = POINT_BUY_COST[v] ?? 0;
          return (
            <div
              key={a.key}
              className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2"
            >
              <span className="font-mono text-sm text-zinc-400">{a.label}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => dec(a.key)}
                  disabled={v <= 8}
                  className="grid h-7 w-7 place-items-center rounded bg-zinc-800 text-sm hover:bg-zinc-700 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-base">{v}</span>
                <button
                  type="button"
                  onClick={() => inc(a.key)}
                  disabled={v >= 15 || (POINT_BUY_COST[v + 1] ?? 99) - cost > remaining}
                  className="grid h-7 w-7 place-items-center rounded bg-zinc-800 text-sm hover:bg-zinc-700 disabled:opacity-30"
                >
                  +
                </button>
                <span className="ml-2 text-xs text-zinc-500">{cost}p</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RollEditor({
  scores,
  setScore,
}: {
  scores: Scores;
  setScore: (k: keyof Scores, v: number) => void;
}) {
  function rollAll() {
    for (const a of ABILITIES) {
      // 4d6 drop lowest
      const rolls = [d6(), d6(), d6(), d6()].sort((x, y) => x - y).slice(1);
      const total = rolls.reduce((s, r) => s + r, 0);
      setScore(a.key, total);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">Each score in [3, 18] (4d6 drop lowest range).</p>
        <button
          type="button"
          onClick={rollAll}
          className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          🎲 Roll all (4d6dl)
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ABILITIES.map((a) => (
          <label key={a.key} className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-zinc-400">{a.label}</span>
            <input
              type="number"
              min={3}
              max={18}
              value={scores[a.key]}
              onChange={(e) => setScore(a.key, Math.max(3, Math.min(18, Number(e.target.value))))}
              className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-center text-sm focus:border-indigo-500 focus:outline-none"
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
