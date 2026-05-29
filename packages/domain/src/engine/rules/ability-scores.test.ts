/**
 * Gate B — engine-only ability score corpus.
 *
 * 7 archetypes covering:
 *   1. Standard array, no bonuses — base pass-through
 *   2. Mountain Dwarf racial +2 STR +2 CON (PHB p.18, p.20)
 *   3. Half-Elf +2 CHA + 2 choice (PHB p.39)
 *   4. Mountain Dwarf Fighter L4, racial +2 STR + level-up +2 STR (PHB p.165)
 *   5. Resilient CON half-feat +1 CON (PHB p.168)
 *   6. 20-cap edge: STR 16 + racial+2 + level-up+2 = 20, write-time enforced (PHB p.165)
 *   7. Wild Shape active — composition proof, NOT live sheet divergence
 *      (PHB p.66-67; no Wild Shape persistence path is wired — domain proof only)
 *
 * REQ-AS-GATEB-01: engine-only literal assertions; computeEffectiveScores import removed;
 * assertEngineEqualsLegacy helper removed. Expected literals verified against Gate A
 * captured outputs (#1173 archive-report).
 *
 * REQ-AS-PARITY-01..08, REQ-AS-REPLACE-01..03, REQ-AS-CAP-01
 */
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import { buildWildShapeModifiers } from './wild-shape.js';
import { deriveAbilityScoreModifiers } from '../adapter/derive-ability-score-modifiers.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { AppliedAsi } from '../../character/race/types.js';
import type { AppliedFeat } from '../../character/feat/types.js';
import type { AbilityScores } from '../../character/stats/types.js';

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

interface SnapshotSlice {
  asisApplied?: AppliedAsi[];
  levelUpAsis?: AppliedAsi[];
  feats?: AppliedFeat[];
}

function makeRegistryAndCtx(charId: EntityId, slice: SnapshotSlice) {
  const registry = createInMemoryRegistry();
  const ctx = makeCtx(charId);
  const asiMods = deriveAbilityScoreModifiers(slice, charId);
  for (const m of asiMods) registry.register(m);
  return { registry, ctx };
}

// ── Archetype 1 — Standard array, no bonuses (REQ-AS-PARITY-02) ──────────────

describe('Archetype 1 — Human Fighter L1, standard array, no ASIs (REQ-AS-PARITY-02)', () => {
  it('all 6 abilities match base values; no bonuses applied (PHB p.13)', () => {
    // PHB p.13 — modifier formula; standard array defined in introductory chapter.
    // Gate A captured: STR 15, DEX 14, CON 13, INT 12, WIS 10, CHA 8 (no ASIs).
    const baseStats: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    const charId = eid('human-fighter-l1');
    const { registry, ctx } = makeRegistryAndCtx(charId, {});
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(15);
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(14);
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(13);
    expect(resolveStat(charId, 'int', baseStats.int, ctx, registry).value).toBe(12);
    expect(resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(8);
  });
});

// ── Archetype 2 — Mountain Dwarf racial +2 STR +2 CON (REQ-AS-PARITY-03) ────

describe('Archetype 2 — Mountain Dwarf racial +2 STR +2 CON (REQ-AS-PARITY-03)', () => {
  it('STR 13+2=15, CON 14+2=16 (PHB p.18, p.20)', () => {
    // PHB p.18 — Dwarf: +2 CON
    // PHB p.20 — Mountain Dwarf subrace: +2 STR
    // Gate A captured: STR 15, DEX 10, CON 16, INT 10, WIS 10, CHA 8.
    const baseStats: AbilityScores = { str: 13, dex: 10, con: 14, int: 10, wis: 10, cha: 8 };
    const charId = eid('mountain-dwarf');
    const slice: SnapshotSlice = {
      asisApplied: [
        { ability: 'str', bonus: 2, source: 'subrace' },
        { ability: 'con', bonus: 2, source: 'subrace' },
      ],
    };
    const { registry, ctx } = makeRegistryAndCtx(charId, slice);
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(15); // 13+2
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(16); // 14+2
    expect(resolveStat(charId, 'int', baseStats.int, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(8);
  });
});

// ── Archetype 3 — Half-Elf +2 CHA + 2 choice (REQ-AS-PARITY-04) ─────────────

describe('Archetype 3 — Half-Elf +2 CHA + 2 choice (REQ-AS-PARITY-04)', () => {
  it('CHA 14+2=16, STR 10+1=11, DEX 12+1=13 (PHB p.39)', () => {
    // PHB p.39 — Half-Elf: +2 to Charisma, +1 to two other ability scores of your choice.
    // Gate A captured: STR 11, DEX 13, CON 10, INT 10, WIS 10, CHA 16.
    const baseStats: AbilityScores = { str: 10, dex: 12, con: 10, int: 10, wis: 10, cha: 14 };
    const charId = eid('half-elf');
    const slice: SnapshotSlice = {
      asisApplied: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
      ],
    };
    const { registry, ctx } = makeRegistryAndCtx(charId, slice);
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(11); // 10+1
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(13); // 12+1
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'int', baseStats.int, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(16); // 14+2
  });
});

// ── Archetype 4 — L4 ASI stacking with racial (REQ-AS-PARITY-05) ─────────────

describe('Archetype 4 — Mountain Dwarf Fighter L4, racial+2+levelup+2 STR (REQ-AS-PARITY-05)', () => {
  it('STR 13+2+2=17, CON 14+2=16 (PHB p.165)', () => {
    // PHB p.165 — "When you reach 4th level... you can increase one ability score by 2..."
    // All ASI sources stack (PHB p.13 — no keep-highest between sources).
    // Gate A captured: STR 17, DEX 10, CON 16, INT 10, WIS 10, CHA 8.
    const baseStats: AbilityScores = { str: 13, dex: 10, con: 14, int: 10, wis: 10, cha: 8 };
    const charId = eid('mountain-dwarf-fighter-l4');
    const slice: SnapshotSlice = {
      asisApplied: [
        { ability: 'str', bonus: 2, source: 'subrace' },  // Mountain Dwarf PHB p.20
        { ability: 'con', bonus: 2, source: 'subrace' },  // Dwarf PHB p.18
      ],
      levelUpAsis: [
        { ability: 'str', bonus: 2, source: 'levelup' }, // L4 ASI PHB p.165
      ],
    };
    const { registry, ctx } = makeRegistryAndCtx(charId, slice);
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(17); // 13+2+2
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(16); // 14+2
    expect(resolveStat(charId, 'int', baseStats.int, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(8);
  });
});

// ── Archetype 5 — Resilient half-feat +1 CON (REQ-AS-PARITY-06) ──────────────

describe('Archetype 5 — Resilient CON half-feat +1 CON (REQ-AS-PARITY-06)', () => {
  it('CON 14+1=15 (PHB p.168)', () => {
    // PHB p.168 — Resilient: "+1 to the chosen ability score (maximum 20)."
    // Gate A captured: STR 10, DEX 10, CON 15, INT 10, WIS 10, CHA 10.
    const baseStats: AbilityScores = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
    const charId = eid('resilient-con');
    const slice: SnapshotSlice = {
      feats: [{ slug: 'resilient', source: 'PHB', asisApplied: [{ ability: 'con', bonus: 1 }] }],
    };
    const { registry, ctx } = makeRegistryAndCtx(charId, slice);
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(15); // 14+1
    expect(resolveStat(charId, 'int', baseStats.int, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(10);
  });
});

// ── Archetype 6 — 20-cap edge, write-time enforced (REQ-AS-PARITY-07, REQ-AS-CAP-01) ─

describe('Archetype 6 — 20-cap edge: STR 16 + racial+2 + levelup+2 = 20 (REQ-AS-PARITY-07)', () => {
  it('engine === 20; no engine clamp applied (PHB p.165)', () => {
    // PHB p.165 — "You can't increase an ability score above 20 using this feature."
    // The 20 cap is enforced at WRITE-TIME by validateAsiDelta. The row stored is
    // capped to 20. The engine does NOT clamp — it trusts the stored value.
    // REQ-AS-CAP-01: no post-stacking clamp in engine path.
    // Gate A captured: STR 20, all others at base.
    const baseStats: AbilityScores = { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const charId = eid('cap-edge');
    const slice: SnapshotSlice = {
      asisApplied: [{ ability: 'str', bonus: 2, source: 'subrace' }],
      levelUpAsis: [{ ability: 'str', bonus: 2, source: 'levelup' }],
    };
    const { registry, ctx } = makeRegistryAndCtx(charId, slice);
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(20); // 16+2+2
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'int', baseStats.int, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value).toBe(10);
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(10);
  });
});

// ── Archetype 7 — Wild Shape composition proof (REQ-AS-PARITY-08, REQ-AS-REPLACE-01..03) ─

describe('Archetype 7 — Wild Shape active (composition proof, NOT live sheet divergence)', () => {
  /**
   * COMPOSITION PROOF ONLY — this is NOT a live sheet divergence.
   * Wild Shape has no persistence path wired; there is no route that saves
   * Wild Shape state and returns it via GET /sheet. This test exists to document
   * and prove the domain composition: ReplaceMod substitution happens BEFORE
   * NumMod stacking (stat.ts Step 3 before Step 4), and the engine correctly
   * applies beast physical stats while retaining druid mental stats.
   *
   * PHB p.66-67 — Wild Shape: "Your game statistics are replaced by the statistics
   * of the beast, but you retain your... Intelligence, Wisdom, and Charisma scores."
   *
   * REQ-AS-WILDSHAPE-01: archetype stays engine-only composition proof; NO legacy comparison.
   * Per design decision ADR-6: post-flip, no legacy path for normal rows. Engine IS the truth.
   */
  it('engine STR=12 (Wolf) — beast physical stat replacement (PHB p.66-67)', () => {
    const charId = eid('druid-wolf');
    const beastId = eid('wolf');

    // Druid base stats (low physical)
    const baseStats: AbilityScores = { str: 10, dex: 12, con: 13, int: 14, wis: 16, cha: 11 };

    // Wolf beast stats (from Wild Shape; PHB p.311 Wolf stat block)
    const WOLF_STATS = { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 };

    // ── Engine path: ReplaceMod registered → resolveStat substitutes beast STR ──
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);

    // Build Wild Shape modifiers (ReplaceMod for STR/DEX/CON, retain INT/WIS/CHA)
    const wsResult = buildWildShapeModifiers(
      charId,
      beastId,
      (_id: EntityId) => WOLF_STATS,
    );
    expect(wsResult.ok).toBe(true);
    if (!wsResult.ok) return;
    wsResult.instances.forEach((inst) => registry.register(inst));

    // Also register ASI mods (druid has none in this fixture)
    const asiMods = deriveAbilityScoreModifiers({}, charId);
    for (const m of asiMods) registry.register(m);

    // REQ-AS-REPLACE-01: Physical stat: engine uses beast value (ReplaceMod Step 3 before NumMod Step 4)
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(12); // wolf STR
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(15); // wolf DEX
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(12); // wolf CON

    // REQ-AS-REPLACE-02: Mental stats retained (INT/WIS/CHA from druid)
    expect(resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value).toBe(16); // druid WIS retained
    expect(resolveStat(charId, 'int', baseStats.int, ctx, registry).value).toBe(14); // druid INT retained
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(11); // druid CHA retained
  });
});
