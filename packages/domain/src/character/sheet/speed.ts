/**
 * Speed pipeline helpers — extracted from compute.ts (C2 refactor).
 *
 * These functions were previously private to compute.ts. They are extracted
 * here so both compute.ts (legacy path) and the characters.ts route
 * (engine-authoritative path) can import them without duplication.
 *
 * Design ref: sdd/engine-barbarian-dsl-3/design D5a.
 * REQ-SPEED-06, REQ-SPEED-07, REQ-SPEED-08.
 * REQ-OOS-02: compute.ts speed pipeline structural integrity preserved.
 */

import type { ExhaustionEffect } from './types.js';
import type { RaceSheetData } from './types.js';

/**
 * Speed shape used by the pipeline (mirrors CharacterSheet['speed']).
 * Defined here to keep speed.ts self-contained (no circular import via types.js).
 */
export type SpeedShape = { walk: number; fly?: number; swim?: number; climb?: number };

/**
 * Normalizes the `speed` field from 5etools race data (number | object | null | undefined)
 * into the canonical `{ walk, fly?, swim?, climb? }` shape.
 *
 * null/undefined input → { walk: 30 } default (REQ-SPEED-11 legacy tolerance, PHB default walk).
 */
export function normalizeSpeed(s: RaceSheetData['speed'] | null | undefined): SpeedShape {
  if (typeof s === 'number') return { walk: s };
  if (s && typeof s === 'object') {
    return {
      walk: typeof s['walk'] === 'number' ? s['walk'] : 30,
      ...(typeof s['fly'] === 'number' ? { fly: s['fly'] } : {}),
      ...(typeof s['swim'] === 'number' ? { swim: s['swim'] } : {}),
      ...(typeof s['climb'] === 'number' ? { climb: s['climb'] } : {}),
    };
  }
  return { walk: 30 };
}

/**
 * Subtracts `penalty` feet from every speed component, floored at 0.
 * Used for encumbrance variant: encumbered -10 ft, heavily encumbered -20 ft.
 * PHB p.143.
 *
 * penalty <= 0 → pass-through (no encumbrance active).
 */
export function applySpeedPenalty(speed: SpeedShape, penalty: number): SpeedShape {
  if (penalty <= 0) return speed;
  const sub = (v: number) => Math.max(0, v - penalty);
  const out: SpeedShape = { walk: sub(speed.walk) };
  if (speed.fly !== undefined) out.fly = sub(speed.fly);
  if (speed.swim !== undefined) out.swim = sub(speed.swim);
  if (speed.climb !== undefined) out.climb = sub(speed.climb);
  return out;
}

/**
 * Applies exhaustion effects that mutate speed (speed-halved and speed-zero).
 * PHB p.291: speed-halved at exhaustion level 2, speed-zero at level 5.
 *
 * All speed modes are affected equally (walk, fly, swim, climb).
 * Halving uses Math.floor (PHB convention for fractional distances).
 */
export function applyExhaustionToSpeed(speed: SpeedShape, effects: ExhaustionEffect[]): SpeedShape {
  if (effects.includes('speed-zero')) {
    const out: SpeedShape = { walk: 0 };
    if (speed.fly !== undefined) out.fly = 0;
    if (speed.swim !== undefined) out.swim = 0;
    if (speed.climb !== undefined) out.climb = 0;
    return out;
  }
  if (effects.includes('speed-halved')) {
    const half = (v: number) => Math.floor(v / 2);
    const out: SpeedShape = { walk: half(speed.walk) };
    if (speed.fly !== undefined) out.fly = half(speed.fly);
    if (speed.swim !== undefined) out.swim = half(speed.swim);
    if (speed.climb !== undefined) out.climb = half(speed.climb);
    return out;
  }
  return speed;
}

/**
 * Returns the active exhaustion effects for a given level (cumulative).
 * PHB p.291.
 *
 * Level 0 → empty array (no effects).
 * Level 1 → disadvantage on ability checks.
 * Level 2 → + speed halved.
 * Level 3 → + disadvantage on attacks and saves.
 * Level 4 → + HP max halved.
 * Level 5 → + speed becomes 0.
 * Level 6 → + dead.
 */
export function exhaustionEffectsFor(level: number): ExhaustionEffect[] {
  const out: ExhaustionEffect[] = [];
  if (level >= 1) out.push('disadvantage-ability-checks');
  if (level >= 2) out.push('speed-halved');
  if (level >= 3) out.push('disadvantage-attacks-and-saves');
  if (level >= 4) out.push('hp-max-halved');
  if (level >= 5) out.push('speed-zero');
  if (level >= 6) out.push('dead');
  return out;
}
