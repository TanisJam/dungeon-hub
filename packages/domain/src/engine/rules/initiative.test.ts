/**
 * Parity gate corpus — engine initiative resolution (Gate A: engine resolveStat === legacy dexMod).
 *
 * Source rule:
 *   PHB p.177 — "Initiative: At the beginning of every combat, you roll initiative by
 *   making a Dexterity check. Initiative determines the order of creatures' turns in combat."
 *   PHB p.13  — ability modifier = floor((score - 10) / 2)
 *
 * 5 archetypes:
 *   1. DEX 10 → initiative 0           (neutral)
 *   2. DEX 16 → initiative +3          (matches compute.test.ts fixture, PHB p.13)
 *   3. DEX 20 → initiative +5          (high DEX, PHB p.13)
 *   4. DEX 8  → initiative -1          (negative mod, PHB p.13)
 *   5. DEX 16 + NumMod +2 → initiative +5  (engine NumMod composition, forward-compat for Alert/JOAT)
 *
 * Archetype 5 proves the engine's NumMod composition path works for 'initiative'.
 * This is the forward-compatibility proof: Alert (PHB p.165 +5) and Jack of All Trades
 * (Bard half-proficiency, PHB p.54) will land as NumMods when implemented — they
 * just need to be registered; no other engine change required.
 *
 * REQ-GATE-INIT-01: engine resolveStat('initiative', dexMod) === dexMod for all archetypes.
 * REQ-GATE-INIT-05: NumMod flat bonus composes additively on initiative.
 */
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import type { EntityId, NumMod } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

function makeCtx(selfId: EntityId): EvaluationContext {
  return {
    self: { id: selfId, conditions: [] },
    activeConditions: [],
  };
}

/** PHB p.13 — ability modifier formula */
function dexMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function makeNumModInstance(
  id: string,
  amount: number,
  owner: EntityId,
): ModifierInstance {
  const def: NumMod = { kind: 'num', op: 'add', value: amount, stat: 'initiative', category: 'untyped' };
  return {
    id: id as ModifierInstanceId,
    def,
    scope: {
      owner,
      target: { axis: 'self' },
      trigger: 'always',
    },
  };
}

// ── Archetype 1 — DEX 10 (neutral) ───────────────────────────────────────────

describe('Archetype 1 — DEX 10: initiative = 0 (PHB p.13/p.177)', () => {
  // PHB p.13 — DEX 10 → modifier 0
  // PHB p.177 — initiative = DEX modifier
  const CHAR_ID = eid('init-dex10');

  it('resolveStat initiative = 0 (DEX 10 → mod 0, no active effects)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const base = dexMod(10); // 0
    const resolved = resolveStat(CHAR_ID, 'initiative', base, ctx, registry);
    expect(resolved.value).toBe(0);
  });
});

// ── Archetype 2 — DEX 16 (+3) ─────────────────────────────────────────────────

describe('Archetype 2 — DEX 16: initiative = +3 (PHB p.13/p.177)', () => {
  // PHB p.13 — DEX 16 → modifier +3
  // Matches the compute.test.ts fixture (DEX 16, initiative should be 3)
  const CHAR_ID = eid('init-dex16');

  it('resolveStat initiative = +3 (DEX 16 → mod +3, PHB p.13)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const base = dexMod(16); // +3
    expect(base).toBe(3);
    const resolved = resolveStat(CHAR_ID, 'initiative', base, ctx, registry);
    expect(resolved.value).toBe(3);
  });
});

// ── Archetype 3 — DEX 20 (+5) ─────────────────────────────────────────────────

describe('Archetype 3 — DEX 20: initiative = +5 (PHB p.13/p.177)', () => {
  // PHB p.13 — DEX 20 → modifier +5 (standard cap for non-racial-boosted adventurers)
  const CHAR_ID = eid('init-dex20');

  it('resolveStat initiative = +5 (DEX 20 → mod +5, PHB p.13)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const base = dexMod(20); // +5
    expect(base).toBe(5);
    const resolved = resolveStat(CHAR_ID, 'initiative', base, ctx, registry);
    expect(resolved.value).toBe(5);
  });
});

// ── Archetype 4 — DEX 8 (-1) ──────────────────────────────────────────────────

describe('Archetype 4 — DEX 8: initiative = -1 (PHB p.13/p.177)', () => {
  // PHB p.13 — DEX 8 → modifier -1 (negative modifier — clumsy character)
  const CHAR_ID = eid('init-dex8');

  it('resolveStat initiative = -1 (DEX 8 → mod -1, PHB p.13)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const base = dexMod(8); // -1
    expect(base).toBe(-1);
    const resolved = resolveStat(CHAR_ID, 'initiative', base, ctx, registry);
    expect(resolved.value).toBe(-1);
  });
});

// ── Archetype 5 — DEX 16 + NumMod +2 → +5 ────────────────────────────────────

describe('Archetype 5 — DEX 16 + NumMod +2: initiative = +5 (engine NumMod composition)', () => {
  // PHB p.13 — DEX 16 → modifier +3
  // NumMod +2 (flat bonus, e.g. Alert feat PHB p.165: +5, or JOAT PHB p.54: half-pb)
  // Engine composes additively: +3 + +2 = +5
  // This proves 'initiative' StatKey routes through the NumMod stacking path —
  // future Alert/JOAT/Remarkable Athlete implementations need only register a NumMod.
  const CHAR_ID = eid('init-dex16-mod');

  it('resolveStat initiative = +5 (DEX 16 mod +3 + NumMod +2, PHB p.13)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    // Register a flat +2 bonus (forward-compat for Alert/JOAT)
    registry.register(makeNumModInstance('init-bonus-1', 2, CHAR_ID));

    const base = dexMod(16); // +3
    expect(base).toBe(3);
    const resolved = resolveStat(CHAR_ID, 'initiative', base, ctx, registry);
    expect(resolved.value).toBe(5); // +3 + +2 = +5
  });

  it('breakdown includes NumMod contribution alongside base', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    registry.register(makeNumModInstance('init-bonus-2', 2, CHAR_ID));

    const base = dexMod(16); // +3
    const resolved = resolveStat(CHAR_ID, 'initiative', base, ctx, registry);

    const baseSrc = resolved.breakdown.find((s) => s.label === 'base');
    expect(baseSrc, 'base source must be in breakdown').toBeDefined();
    expect(baseSrc!.amount).toBe(3);

    const modSrc = resolved.breakdown.find((s) => s.type === 'untyped' && s.label !== 'base');
    expect(modSrc, 'NumMod +2 must appear in breakdown').toBeDefined();
    expect(modSrc!.amount).toBe(2);
  });
});
