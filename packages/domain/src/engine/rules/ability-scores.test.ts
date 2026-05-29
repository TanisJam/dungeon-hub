/**
 * Parity gate corpus — engine ability score resolution vs legacy computeEffectiveScores.
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
 * REQ-AS-PARITY-01..08, REQ-AS-REPLACE-01..03, REQ-AS-CAP-01
 */
import { describe, it, expect } from 'vitest';
import { computeEffectiveScores } from '../../character/multiclass/effective-scores.js';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import { buildWildShapeModifiers } from './wild-shape.js';
import { deriveAbilityScoreModifiers } from '../adapter/derive-ability-score-modifiers.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { AppliedAsi } from '../../character/race/types.js';
import type { AppliedFeat } from '../../character/feat/types.js';
import type { AbilityScores, AbilityKey } from '../../character/stats/types.js';
import { ABILITY_KEYS } from '../../character/stats/types.js';

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

/**
 * Assert that engine resolves identical scores to legacy computeEffectiveScores.
 *
 * Engine path: raw baseStats[a] → + ASI NumMods via deriveAbilityScoreModifiers → resolveStat
 * Legacy path: computeEffectiveScores(baseStats, [...racial, ...levelup, ...feat-asis])
 *
 * Both paths are INDEPENDENT. This is what makes the dual-shadow NATIVE.
 */
function assertEngineEqualsLegacy(
  charId: EntityId,
  baseStats: AbilityScores,
  slice: SnapshotSlice,
): void {
  // ── Legacy path ──────────────────────────────────────────────────────────────
  const allAsis: AppliedAsi[] = [
    ...(slice.asisApplied ?? []),
    ...(slice.levelUpAsis ?? []),
    // Feat ASIs as AppliedAsi (they have the same shape minus source — add 'feat')
    ...(slice.feats ?? []).flatMap((f) =>
      f.asisApplied.map((a) => ({ ...a, source: 'feat' as const })),
    ),
  ];
  const legacyScores = computeEffectiveScores(baseStats, allAsis);

  // ── Engine path ──────────────────────────────────────────────────────────────
  const registry = createInMemoryRegistry();
  const ctx = makeCtx(charId);
  const asiMods = deriveAbilityScoreModifiers(slice, charId);
  for (const m of asiMods) registry.register(m);

  for (const ability of ABILITY_KEYS) {
    const resolved = resolveStat(charId, ability, baseStats[ability], ctx, registry);
    expect(resolved.value).toBe(legacyScores[ability]);
  }
}

// ── Archetype 1 — Standard array, no bonuses (REQ-AS-PARITY-02) ──────────────

describe('Archetype 1 — Human Fighter L1, standard array, no ASIs (REQ-AS-PARITY-02)', () => {
  it('engine === legacy for all 6 abilities (PHB p.13)', () => {
    // PHB p.13 — modifier formula; standard array defined in introductory chapter
    const baseStats: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    const charId = eid('human-fighter-l1');
    assertEngineEqualsLegacy(charId, baseStats, {});
  });
});

// ── Archetype 2 — Mountain Dwarf racial +2 STR +2 CON (REQ-AS-PARITY-03) ────

describe('Archetype 2 — Mountain Dwarf racial +2 STR +2 CON (REQ-AS-PARITY-03)', () => {
  it('STR 13+2=15, CON 14+2=16, engine===legacy (PHB p.18, p.20)', () => {
    // PHB p.18 — Dwarf: +2 CON
    // PHB p.20 — Mountain Dwarf subrace: +2 STR
    const baseStats: AbilityScores = { str: 13, dex: 10, con: 14, int: 10, wis: 10, cha: 8 };
    const charId = eid('mountain-dwarf');
    const slice: SnapshotSlice = {
      asisApplied: [
        { ability: 'str', bonus: 2, source: 'subrace' },
        { ability: 'con', bonus: 2, source: 'subrace' },
      ],
    };
    assertEngineEqualsLegacy(charId, baseStats, slice);

    // Explicit value assertions
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);
    const asiMods = deriveAbilityScoreModifiers(slice, charId);
    for (const m of asiMods) registry.register(m);
    const str = resolveStat(charId, 'str', baseStats.str, ctx, registry);
    const con = resolveStat(charId, 'con', baseStats.con, ctx, registry);
    expect(str.value).toBe(15); // 13 + 2
    expect(con.value).toBe(16); // 14 + 2
  });
});

// ── Archetype 3 — Half-Elf +2 CHA + 2 choice (REQ-AS-PARITY-04) ─────────────

describe('Archetype 3 — Half-Elf +2 CHA + 2 choice (REQ-AS-PARITY-04)', () => {
  it('CHA 14+2=16, STR 10+1=11, DEX 12+1=13, engine===legacy (PHB p.39)', () => {
    // PHB p.39 — Half-Elf: +2 to Charisma, +1 to two other ability scores of your choice
    const baseStats: AbilityScores = { str: 10, dex: 12, con: 10, int: 10, wis: 10, cha: 14 };
    const charId = eid('half-elf');
    const slice: SnapshotSlice = {
      asisApplied: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
      ],
    };
    assertEngineEqualsLegacy(charId, baseStats, slice);

    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);
    const asiMods = deriveAbilityScoreModifiers(slice, charId);
    for (const m of asiMods) registry.register(m);
    expect(resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value).toBe(16);
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(11);
    expect(resolveStat(charId, 'dex', baseStats.dex, ctx, registry).value).toBe(13);
  });
});

// ── Archetype 4 — L4 ASI stacking with racial (REQ-AS-PARITY-05) ─────────────

describe('Archetype 4 — Mountain Dwarf Fighter L4, racial+2+levelup+2 STR (REQ-AS-PARITY-05)', () => {
  it('STR 13+2+2=17, engine===legacy (PHB p.165)', () => {
    // PHB p.165 — "When you reach 4th level... you can increase one ability score by 2..."
    // All ASI sources stack (PHB p.13 — no keep-highest between sources)
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
    assertEngineEqualsLegacy(charId, baseStats, slice);

    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);
    const asiMods = deriveAbilityScoreModifiers(slice, charId);
    for (const m of asiMods) registry.register(m);
    expect(resolveStat(charId, 'str', baseStats.str, ctx, registry).value).toBe(17); // 13+2+2
  });
});

// ── Archetype 5 — Resilient half-feat +1 CON (REQ-AS-PARITY-06) ──────────────

describe('Archetype 5 — Resilient CON half-feat +1 CON (REQ-AS-PARITY-06)', () => {
  it('CON 14+1=15, engine===legacy (PHB p.168)', () => {
    // PHB p.168 — Resilient: "+1 to the chosen ability score (maximum 20)."
    const baseStats: AbilityScores = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
    const charId = eid('resilient-con');
    const slice: SnapshotSlice = {
      feats: [{ slug: 'resilient', source: 'PHB', asisApplied: [{ ability: 'con', bonus: 1 }] }],
    };
    assertEngineEqualsLegacy(charId, baseStats, slice);

    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);
    const asiMods = deriveAbilityScoreModifiers(slice, charId);
    for (const m of asiMods) registry.register(m);
    expect(resolveStat(charId, 'con', baseStats.con, ctx, registry).value).toBe(15); // 14+1
  });
});

// ── Archetype 6 — 20-cap edge, write-time enforced (REQ-AS-PARITY-07, REQ-AS-CAP-01) ─

describe('Archetype 6 — 20-cap edge: STR 16 + racial+2 + levelup+2 = 20 (REQ-AS-PARITY-07)', () => {
  it('engine === legacy === 20; no engine clamp applied (PHB p.165)', () => {
    // PHB p.165 — "You can't increase an ability score above 20 using this feature."
    // The 20 cap is enforced at WRITE-TIME by validateAsiDelta. The row stored is
    // capped to 20. The engine does NOT clamp — it trusts the stored value.
    // REQ-AS-CAP-01: no post-stacking clamp in engine path.
    //
    // This archetype encodes the CORRECT scenario: base 16 + racial+2 + levelup+2 = 20.
    // The write-time gate prevents total ASIs from pushing above 20, so the stored
    // effective value is 20 and no over-cap path is exercised here.
    const baseStats: AbilityScores = { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const charId = eid('cap-edge');
    const slice: SnapshotSlice = {
      asisApplied: [{ ability: 'str', bonus: 2, source: 'subrace' }],
      levelUpAsis: [{ ability: 'str', bonus: 2, source: 'levelup' }],
    };
    assertEngineEqualsLegacy(charId, baseStats, slice);

    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);
    const asiMods = deriveAbilityScoreModifiers(slice, charId);
    for (const m of asiMods) registry.register(m);
    const result = resolveStat(charId, 'str', baseStats.str, ctx, registry);
    expect(result.value).toBe(20); // 16+2+2 = 20
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
   * Per ledger §2 taxonomy: this is "engine-más-correcto" — the engine is MORE
   * accurate than legacy (which ignores Wild Shape entirely). This diff is
   * intentional and documented, NOT a parity failure.
   *
   * Cross-reference: wild-shape.test.ts for the full substitution proof.
   */
  it('engine STR=12 (Wolf), legacy STR=10 (Druid raw); engine !== legacy — intentional documented diff (PHB p.66-67)', () => {
    const charId = eid('druid-wolf');
    const beastId = eid('wolf');

    // Druid base stats (low physical)
    const baseStats: AbilityScores = { str: 10, dex: 12, con: 13, int: 14, wis: 16, cha: 11 };

    // Wolf beast stats (from Wild Shape; PHB p.311 Wolf stat block)
    const WOLF_STATS = { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 };

    // ── Legacy path ignores Wild Shape (legacy-only; no WS state in snapshot) ──
    const legacyStr = computeEffectiveScores(baseStats, []).str;
    expect(legacyStr).toBe(10); // druid raw STR

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

    // Physical stat: engine uses beast value (ReplaceMod Step 3 before NumMod Step 4)
    const engineStr = resolveStat(charId, 'str', baseStats.str, ctx, registry).value;
    expect(engineStr).toBe(12); // wolf STR

    // REQ-AS-REPLACE-03: explicitly assert engine !== legacy for physical stat
    expect(engineStr).not.toBe(legacyStr);

    // REQ-AS-REPLACE-02: mental stats retained (INT/WIS/CHA from druid)
    const engineWis = resolveStat(charId, 'wis', baseStats.wis, ctx, registry).value;
    expect(engineWis).toBe(16); // druid WIS retained
    const engineInt = resolveStat(charId, 'int', baseStats.int, ctx, registry).value;
    expect(engineInt).toBe(14); // druid INT retained
    const engineCha = resolveStat(charId, 'cha', baseStats.cha, ctx, registry).value;
    expect(engineCha).toBe(11); // druid CHA retained
  });

  it('legacy STR equals druid raw value (Wild Shape not reflected in legacy)', () => {
    const baseStats: AbilityScores = { str: 10, dex: 12, con: 13, int: 14, wis: 16, cha: 11 };
    const legacy = computeEffectiveScores(baseStats, []);
    expect(legacy.str).toBe(10); // druid raw — legacy ignores Wild Shape
  });
});
