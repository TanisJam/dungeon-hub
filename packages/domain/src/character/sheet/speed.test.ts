/**
 * Characterization tests — speed pipeline functions extracted to speed.ts.
 *
 * These tests lock the existing behavior of:
 *   - normalizeSpeed
 *   - applySpeedPenalty
 *   - applyExhaustionToSpeed
 *   - exhaustionEffectsFor
 *
 * They were written BEFORE the extraction (T-C2-01) to serve as the regression
 * lock and composition-order guard required by REQ-SPEED-07 (R1 mitigation).
 *
 * Source rules:
 *   PHB p.291 — exhaustion effects (speed-halved at level 2, speed-zero at level 5)
 *   PHB p.143 — encumbrance variant: encumbered -10 ft, heavily encumbered -20 ft
 *
 * REQ-SPEED-07, REQ-SPEED-08, REQ-SPEED-09, REQ-SPEED-11.
 * SCENARIO-05, SCENARIO-06, SCENARIO-07 (composition-order lock).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeSpeed,
  applySpeedPenalty,
  applyExhaustionToSpeed,
  exhaustionEffectsFor,
} from './speed.js';

// ── normalizeSpeed ────────────────────────────────────────────────────────────

describe('normalizeSpeed', () => {
  it('number input → { walk: N }', () => {
    expect(normalizeSpeed(30)).toEqual({ walk: 30 });
    expect(normalizeSpeed(25)).toEqual({ walk: 25 });
  });

  it('object input with walk → preserved exactly', () => {
    expect(normalizeSpeed({ walk: 35 })).toEqual({ walk: 35 });
  });

  it('object input with walk + fly → both preserved', () => {
    expect(normalizeSpeed({ walk: 25, fly: 50 })).toEqual({ walk: 25, fly: 50 });
  });

  it('object input with walk + swim + climb → all modes preserved', () => {
    expect(normalizeSpeed({ walk: 30, swim: 30, climb: 30 })).toEqual({
      walk: 30,
      swim: 30,
      climb: 30,
    });
  });

  it('null input → { walk: 30 } default (REQ-SPEED-11 legacy tolerance)', () => {
    // Legacy rows with no raceData.speed → default 30
    expect(normalizeSpeed(null)).toEqual({ walk: 30 });
  });

  it('undefined input → { walk: 30 } default', () => {
    expect(normalizeSpeed(undefined)).toEqual({ walk: 30 });
  });

  it('object input missing walk property → { walk: 30 } default', () => {
    // Malformed 5etools entry — should default walk to 30
    expect(normalizeSpeed({ fly: 50 } as unknown as Parameters<typeof normalizeSpeed>[0])).toEqual({
      walk: 30,
      fly: 50,
    });
  });
});

// ── applySpeedPenalty ─────────────────────────────────────────────────────────

describe('applySpeedPenalty', () => {
  it('penalty 0 → pass-through (no encumbrance)', () => {
    const speed = { walk: 30 };
    expect(applySpeedPenalty(speed, 0)).toEqual({ walk: 30 });
  });

  it('penalty -5 (negative) → pass-through (guard: penalty <= 0)', () => {
    const speed = { walk: 30 };
    expect(applySpeedPenalty(speed, -5)).toEqual({ walk: 30 });
  });

  it('encumbered -10 → walk 30 - 10 = 20 (PHB p.143 encumbrance variant)', () => {
    // PHB p.143: encumbered condition reduces speed by 10 ft.
    expect(applySpeedPenalty({ walk: 30 }, 10)).toEqual({ walk: 20 });
  });

  it('heavily encumbered -20 → walk 30 - 20 = 10 (PHB p.143)', () => {
    // PHB p.143: heavily encumbered reduces speed by 20 ft.
    expect(applySpeedPenalty({ walk: 30 }, 20)).toEqual({ walk: 10 });
  });

  it('SCENARIO-07 composition case: +10 boosted walk then -20 → max(40-20, 0) = 20', () => {
    // SCENARIO-07: +10 Fast Movement applied before penalty.
    // applySpeedPenalty({walk:40}, 20) = {walk:20}. Observable: +10 already included.
    expect(applySpeedPenalty({ walk: 40 }, 20)).toEqual({ walk: 20 });
  });

  it('floor at zero — penalty larger than walk speed (REQ-SPEED-11)', () => {
    // Speed cannot go below 0.
    expect(applySpeedPenalty({ walk: 10 }, 20)).toEqual({ walk: 0 });
  });

  it('non-walk modes (fly, swim, climb) are each reduced (REQ-SPEED-08)', () => {
    // SCENARIO-17 structural: non-walk modes pass through penalty independently.
    const speed = { walk: 30, fly: 50, swim: 20, climb: 15 };
    expect(applySpeedPenalty(speed, 10)).toEqual({ walk: 20, fly: 40, swim: 10, climb: 5 });
  });

  it('non-walk mode floored at zero individually', () => {
    const speed = { walk: 30, swim: 5 };
    expect(applySpeedPenalty(speed, 10)).toEqual({ walk: 20, swim: 0 });
  });
});

// ── applyExhaustionToSpeed ────────────────────────────────────────────────────

describe('applyExhaustionToSpeed', () => {
  it('level-0 effects → pass-through', () => {
    // PHB p.291: no speed effect at exhaustion 0.
    const effects = exhaustionEffectsFor(0);
    expect(applyExhaustionToSpeed({ walk: 30 }, effects)).toEqual({ walk: 30 });
  });

  it('SCENARIO-06 composition case: exhaustion-2 halves boosted speed 40 → 20 (PHB p.291)', () => {
    // SCENARIO-06: +10 Fast Movement applied BEFORE exhaustion halving.
    // applyExhaustionToSpeed({walk:40}, ['speed-halved']) = {walk:20}
    // NOT: applyExhaustionToSpeed({walk:30}, ['speed-halved']) + 10 = 25.
    // PHB p.291: "Speed halved" at exhaustion level 2.
    const effects = exhaustionEffectsFor(2);
    expect(effects).toContain('speed-halved');
    expect(applyExhaustionToSpeed({ walk: 40 }, effects)).toEqual({ walk: 20 });
  });

  it('exhaustion-2 halves walk speed (PHB p.291 — floor on halving)', () => {
    // PHB p.291: speed halved at level 2. Floor ensures whole number.
    const effects = exhaustionEffectsFor(2);
    expect(applyExhaustionToSpeed({ walk: 30 }, effects)).toEqual({ walk: 15 });
  });

  it('exhaustion-2 halves fly speed (REQ-SPEED-08 — non-walk modes also affected)', () => {
    // PHB p.291: all speeds halved. Non-walk modes included.
    const effects = exhaustionEffectsFor(2);
    expect(applyExhaustionToSpeed({ walk: 30, fly: 50 }, effects)).toEqual({
      walk: 15,
      fly: 25,
    });
  });

  it('exhaustion-5 zeros all modes (PHB p.291 — "speed becomes 0")', () => {
    // PHB p.291: at exhaustion 5, speed becomes 0 ft.
    const effects = exhaustionEffectsFor(5);
    expect(effects).toContain('speed-zero');
    expect(applyExhaustionToSpeed({ walk: 30, fly: 50, swim: 20 }, effects)).toEqual({
      walk: 0,
      fly: 0,
      swim: 0,
    });
  });

  it('exhaustion-6 also zeros all modes (dead — speed-zero still in effects)', () => {
    // PHB p.291: level 6 = dead. speed-zero is also present at level 5+.
    const effects = exhaustionEffectsFor(6);
    expect(effects).toContain('speed-zero');
    expect(applyExhaustionToSpeed({ walk: 30 }, effects)).toEqual({ walk: 0 });
  });
});

// ── exhaustionEffectsFor ──────────────────────────────────────────────────────

describe('exhaustionEffectsFor', () => {
  it('level 0 → empty array (PHB p.291)', () => {
    expect(exhaustionEffectsFor(0)).toEqual([]);
  });

  it('level 1 → includes disadvantage-ability-checks only (PHB p.291)', () => {
    const effects = exhaustionEffectsFor(1);
    expect(effects).toContain('disadvantage-ability-checks');
    expect(effects).not.toContain('speed-halved');
  });

  it('level 2 → includes speed-halved (PHB p.291)', () => {
    const effects = exhaustionEffectsFor(2);
    expect(effects).toContain('disadvantage-ability-checks');
    expect(effects).toContain('speed-halved');
    expect(effects).not.toContain('speed-zero');
  });

  it('level 5 → includes speed-zero (PHB p.291)', () => {
    const effects = exhaustionEffectsFor(5);
    expect(effects).toContain('speed-zero');
  });

  it('level 6 → includes both speed-halved and speed-zero (PHB p.291)', () => {
    // PHB p.291: level 6 = dead; all earlier effects accumulate.
    const effects = exhaustionEffectsFor(6);
    expect(effects).toContain('speed-halved');
    expect(effects).toContain('speed-zero');
    expect(effects).toContain('dead');
  });
});
