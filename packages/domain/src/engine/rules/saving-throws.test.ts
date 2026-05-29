/**
 * Parity gate corpus — engine saving throw resolution (Gate B: engine-only literals).
 *
 * Gate A (engine===legacy) was in Commit 1. Legacy block deleted in Commit 2.
 * Gate B (this commit): comparative form replaced with captured literal values —
 * the same values that passed Gate A, now the permanent engine regression suite.
 *
 * 9 archetypes:
 *   1. Fighter L5 (STR+CON prof) — PHB p.72, p.179
 *   2. Wizard L5 (INT+WIS prof) — PHB p.114
 *   3. Warlock L5 (WIS+CHA prof) — PHB p.105
 *   4. Rogue L5 (DEX+INT prof) — PHB p.95
 *   5. Multiclass Wizard3+Fighter1 — only Wizard saves (PHB p.164)
 *   6. Fighter + Resilient(Con) — domain-level 2*pb double-count, class (a) divergence (PHB p.168)
 *   7. Fighter + Bless (+1d4 all saves NumMod fan-out) — PHB p.219
 *   8. Cloak of Protection (+1 all saves) — DMG p.159
 *   9. High-DEX no-proficiency — pure modifier (PHB p.13, p.179)
 *
 * REQ-GATE-02, REQ-NATIVE-01..03, REQ-MULTI-01
 */
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import { deriveSavingThrowProficiencies } from '../adapter/derive-saving-throw-proficiencies.js';
import { buildResilientConModifiers } from './resilient-con.js';
import { buildBlessModifiers } from './bless.js';
import { buildCloakOfProtectionModifiers } from './cloak-of-protection.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
import { ABILITY_KEYS } from '../../character/stats/types.js';
import type { AbilityKey } from '../../character/stats/types.js';

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
function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

interface SaveResult {
  value: number;
  proficient: boolean;
}

/**
 * Resolve all 6 saves via engine.
 * Returns a Record<AbilityKey, SaveResult> for archetype-specific assertions.
 */
function resolveSaves(
  charId: EntityId,
  scores: Record<AbilityKey, number>,
  profSaves: AbilityKey[],
  pb: number,
  extraSetup?: (registry: ReturnType<typeof createInMemoryRegistry>) => void,
): Record<AbilityKey, SaveResult> {
  const registry = createInMemoryRegistry();
  const ctx = makeCtx(charId);

  const saveProfMods = deriveSavingThrowProficiencies(profSaves, charId);
  for (const m of saveProfMods) registry.register(m);

  extraSetup?.(registry);

  const results: Partial<Record<AbilityKey, SaveResult>> = {};
  for (const a of ABILITY_KEYS) {
    const mod = abilityMod(scores[a]);
    const resolved = resolveStat(charId, `saving-throw.${a}`, mod, ctx, registry, pb);
    results[a] = { value: resolved.value, proficient: profSaves.includes(a) };
  }
  return results as Record<AbilityKey, SaveResult>;
}

// ── Archetype 1 — Fighter L5 (STR+CON prof) ──────────────────────────────────

describe('Archetype 1 — Fighter L5 STR+CON proficient (REQ-GATE-02 Scenario 6.1)', () => {
  // PHB p.72 — Fighter saving throws: Strength and Constitution
  // PHB p.179 — saving throw modifier = ability modifier + proficiency bonus (if proficient)
  const CHAR_ID = eid('fighter-l5');
  const scores: Record<AbilityKey, number> = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
  const profSaves: AbilityKey[] = ['str', 'con'];
  const pb = 3; // PHB p.15 — L5 proficiency bonus = +3

  const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);

  it('STR save = +6 (proficient: STR mod +3 + PB +3, PHB p.72/p.179)', () => {
    expect(saves.str.value).toBe(6); // STR mod +3 + PB +3
    expect(saves.str.proficient).toBe(true);
  });

  it('CON save = +5 (proficient: CON mod +2 + PB +3, PHB p.72)', () => {
    expect(saves.con.value).toBe(5); // CON mod +2 + PB +3
    expect(saves.con.proficient).toBe(true);
  });

  it('DEX save = +1 (not proficient: DEX mod +1 only)', () => {
    expect(saves.dex.value).toBe(1); // DEX mod +1, no PB
    expect(saves.dex.proficient).toBe(false);
  });

  it('INT save = 0 (not proficient: INT mod 0)', () => {
    expect(saves.int.value).toBe(0); // INT mod 0, no PB
  });

  it('WIS save = 0 (not proficient: WIS mod 0)', () => {
    expect(saves.wis.value).toBe(0); // WIS mod 0, no PB
  });

  it('CHA save = -1 (not proficient: CHA mod -1)', () => {
    expect(saves.cha.value).toBe(-1); // CHA mod -1, no PB
  });
});

// ── Archetype 2 — Wizard L5 (INT+WIS prof) ───────────────────────────────────

describe('Archetype 2 — Wizard L5 INT+WIS proficient (Scenario 6.2)', () => {
  // PHB p.114 — Wizard saving throws: Intelligence and Wisdom
  const CHAR_ID = eid('wizard-l5');
  const scores: Record<AbilityKey, number> = { str: 8, dex: 14, con: 13, int: 16, wis: 14, cha: 10 };
  const profSaves: AbilityKey[] = ['int', 'wis'];
  const pb = 3;

  const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);

  it('INT save = +6 (proficient: INT mod +3 + PB +3, PHB p.114)', () => {
    expect(saves.int.value).toBe(6); // INT mod +3 + PB +3
  });

  it('WIS save = +5 (proficient: WIS mod +2 + PB +3, PHB p.114)', () => {
    expect(saves.wis.value).toBe(5); // WIS mod +2 + PB +3
  });

  it('STR save = -1 (not proficient: STR mod -1)', () => {
    expect(saves.str.value).toBe(-1); // STR mod -1, no PB
  });

  it('DEX save = +2 (not proficient: DEX mod +2)', () => {
    expect(saves.dex.value).toBe(2); // DEX mod +2, no PB
  });
});

// ── Archetype 3 — Warlock L5 (WIS+CHA prof) ──────────────────────────────────

describe('Archetype 3 — Warlock L5 WIS+CHA proficient (Scenario 6.3)', () => {
  // PHB p.105 — Warlock saving throws: Wisdom and Charisma
  const CHAR_ID = eid('warlock-l5');
  const scores: Record<AbilityKey, number> = { str: 10, dex: 14, con: 12, int: 12, wis: 16, cha: 14 };
  const profSaves: AbilityKey[] = ['wis', 'cha'];
  const pb = 3;

  const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);

  it('WIS save = +6 (proficient: WIS mod +3 + PB +3, PHB p.105)', () => {
    expect(saves.wis.value).toBe(6); // WIS mod +3 + PB +3
  });

  it('CHA save = +5 (proficient: CHA mod +2 + PB +3, PHB p.105)', () => {
    expect(saves.cha.value).toBe(5); // CHA mod +2 + PB +3
  });

  it('STR save = 0 (not proficient: STR mod 0)', () => {
    expect(saves.str.value).toBe(0); // STR mod 0, no PB
  });
});

// ── Archetype 4 — Rogue L5 (DEX+INT prof) ────────────────────────────────────

describe('Archetype 4 — Rogue L5 DEX+INT proficient (Scenario 6.4)', () => {
  // PHB p.95 — Rogue saving throws: Dexterity and Intelligence
  const CHAR_ID = eid('rogue-l5');
  const scores: Record<AbilityKey, number> = { str: 10, dex: 16, con: 12, int: 14, wis: 10, cha: 10 };
  const profSaves: AbilityKey[] = ['dex', 'int'];
  const pb = 3;

  const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);

  it('DEX save = +6 (proficient: DEX mod +3 + PB +3, PHB p.95)', () => {
    expect(saves.dex.value).toBe(6); // DEX mod +3 + PB +3
  });

  it('INT save = +5 (proficient: INT mod +2 + PB +3, PHB p.95)', () => {
    expect(saves.int.value).toBe(5); // INT mod +2 + PB +3
  });

  it('STR save = 0 (not proficient: STR mod 0)', () => {
    expect(saves.str.value).toBe(0); // STR mod 0, no PB
  });
});

// ── Archetype 5 — Multiclass Wizard3+Fighter1 (only Wizard saves) ────────────

describe('Archetype 5 — Multiclass Wizard3/Fighter1: ONLY Wizard saves (REQ-MULTI-01 Scenario 6.5)', () => {
  // PHB p.164 — "When you gain a level in a class other than your first, you
  //              don't gain the class's saving throw proficiencies."
  // Route MUST pass ONLY classes[0].savingThrows = ['int','wis']
  // Fighter's ['str','con'] are NOT granted on multiclass.
  const CHAR_ID = eid('wiz3-fig1');
  const scores: Record<AbilityKey, number> = { str: 10, dex: 12, con: 13, int: 16, wis: 14, cha: 10 };
  const profSaves: AbilityKey[] = ['int', 'wis']; // ONLY primary class (Wizard) saves
  const pb = 2; // L4 total, PB=2

  const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);

  it('INT save = +5 (Wizard class save: INT mod +3 + PB +2, PHB p.114/p.164)', () => {
    expect(saves.int.value).toBe(5); // INT mod +3 + PB +2
    expect(saves.int.proficient).toBe(true);
  });

  it('WIS save = +4 (Wizard class save: WIS mod +2 + PB +2)', () => {
    expect(saves.wis.value).toBe(4); // WIS mod +2 + PB +2
    expect(saves.wis.proficient).toBe(true);
  });

  it('STR save = 0 (NOT proficient: Fighter saves not granted on multiclass, PHB p.164)', () => {
    expect(saves.str.value).toBe(0); // STR mod 0, no PB
    expect(saves.str.proficient).toBe(false);
  });

  it('CON save = +1 (NOT proficient: CON mod +1 only, no class save, PHB p.164)', () => {
    expect(saves.con.value).toBe(1); // CON mod +1, no PB
    expect(saves.con.proficient).toBe(false);
  });
});

// ── Archetype 6 — Fighter + Resilient(Con) double-count ──────────────────────

describe('Archetype 6 — Fighter + Resilient(Con): 2*pb CON save (Scenario 6.6 — class (a) divergence)', () => {
  // PHB p.168 (Resilient feat) + PHB p.72 (Fighter saves: STR+CON)
  //
  // DOCUMENTED DIVERGENCE — class (a) engine-más-correcto:
  // Fighter has CON save from class (savingThrows: ['str','con']).
  // Resilient(Con) ALSO grants a CON save ProficiencyMod.
  // This state is WRITE-BLOCKED by validateCharacterFinal (PROFICIENCY_ALREADY_GRANTED),
  // but may appear on legacy DB rows. The engine surfaces the double-count (2*pb)
  // rather than silently deduplicating — that is the validator's job (CLAUDE.md §11).
  //
  // DOMAIN-LEVEL ONLY: route does NOT register Resilient (ADR-4).
  const CHAR_ID = eid('fighter-resilient');
  const scores: Record<AbilityKey, number> = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
  const profSaves: AbilityKey[] = ['str', 'con'];
  const pb = 3;

  it('CON save = +8 (abilityMod+2 + 2*pb+6 double-count, PHB p.168/p.72)', () => {
    // CON mod +2 + 3 (class prof) + 3 (Resilient prof) = +8
    // Legacy deduplicated via Set → +5. Engine-más-correcto divergence.
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);

    const resilientMods = buildResilientConModifiers(CHAR_ID);
    for (const m of resilientMods) registry.register(m);

    const conMod = abilityMod(scores.con); // +2
    const resolved = resolveStat(CHAR_ID, 'saving-throw.con', conMod, ctx, registry, pb);
    expect(resolved.value).toBe(8); // +2 + 2*3 = +8
  });

  it('STR save = +6 (STR mod +3 + PB +3, single proficiency, no divergence, PHB p.72)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);
    const resilientMods = buildResilientConModifiers(CHAR_ID);
    for (const m of resilientMods) registry.register(m);

    const strMod = abilityMod(scores.str); // +3
    const resolved = resolveStat(CHAR_ID, 'saving-throw.str', strMod, ctx, registry, pb);
    expect(resolved.value).toBe(6); // +3 + 3 = +6
  });
});

// ── Archetype 7 — Fighter + Bless active (all-saves fan-out) ─────────────────

describe('Archetype 7 — Fighter L5 + Bless (+1d4 all saves fan-out, Scenario 6.7)', () => {
  // PHB p.219 — Bless: "+1d4 to attack rolls and saving throws"
  // NumMod{stat:'saving-throw', value:'1d4'} fans out to ALL per-ability saves
  // via the engine's all-saves semantic (stat.ts ~line 133).
  // Dice string '1d4' contributes value=0 to the numeric total; it appears in breakdown[].
  // Equivalence class (c): engine matches legacy + active-effects behavior.
  const CHAR_ID = eid('fighter-bless');
  const CASTER_ID = eid('caster');
  const scores: Record<AbilityKey, number> = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
  const profSaves: AbilityKey[] = ['str', 'con'];
  const pb = 3;
  const TOKEN = 'test-bless-tok';

  it('STR save numeric = +6 (STR mod+3+PB+3; 1d4 is dice, contributes 0 to .value, PHB p.219)', () => {
    // Bless contribution appears in breakdown, NOT in .value (dice roll, not integer)
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);

    const blessMods = buildBlessModifiers(CASTER_ID, [CHAR_ID], TOKEN);
    for (const m of blessMods) registry.register(m);

    const strMod = abilityMod(scores.str);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.str', strMod, ctx, registry, pb);

    expect(resolved.value).toBe(6); // +3 (STR mod) + 3 (pb) = 6 (1d4 stays in breakdown)

    const blessSource = resolved.breakdown.find((s) => s.label?.includes('Bless'));
    expect(blessSource, 'Bless should appear in STR save breakdown').toBeDefined();
    expect(blessSource!.amount).toBe('1d4');
    expect(blessSource!.type).toBe('untyped');
  });

  it('DEX save numeric = +1 (DEX mod+1, not proficient; Bless fans out to DEX too, PHB p.219)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);

    const blessMods = buildBlessModifiers(CASTER_ID, [CHAR_ID], TOKEN);
    for (const m of blessMods) registry.register(m);

    const dexMod = abilityMod(scores.dex);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.dex', dexMod, ctx, registry, pb);

    expect(resolved.value).toBe(1); // DEX mod +1 (no proficiency; 1d4 dice only)

    const blessSource = resolved.breakdown.find((s) => s.label?.includes('Bless'));
    expect(blessSource, 'Bless should fan out to DEX save too').toBeDefined();
  });
});

// ── Archetype 8 — Cloak of Protection (+1 all saves) ─────────────────────────

describe('Archetype 8 — Cloak of Protection (+1 all saves, Scenario 6.8)', () => {
  // DMG p.159 — Cloak of Protection: "+1 bonus to AC and saving throws"
  // NumMod{stat:'saving-throw', value:1, category:'item'} fans out to all per-ability saves.
  // Equivalence class (c): engine matches legacy + active-effects behavior.
  const CHAR_ID = eid('cloak-char');
  const scores: Record<AbilityKey, number> = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };
  const pb = 2;

  it('STR save = +1 (STR mod 0 + Cloak +1 = 1, DMG p.159)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const cloakMods = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-inst-1');
    for (const m of cloakMods) registry.register(m);
    const strMod = abilityMod(scores.str);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.str', strMod, ctx, registry, pb);
    expect(resolved.value).toBe(1); // STR mod 0 + Cloak +1
  });

  it('DEX save = +3 (DEX mod +2 + Cloak +1 = 3, DMG p.159)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const cloakMods = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-inst-1');
    for (const m of cloakMods) registry.register(m);
    const dexMod = abilityMod(scores.dex);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.dex', dexMod, ctx, registry, pb);
    expect(resolved.value).toBe(3); // DEX mod +2 + Cloak +1
  });

  it('every per-ability save includes +1 from Cloak (DMG p.159)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const cloakMods = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-inst-1');
    for (const m of cloakMods) registry.register(m);

    for (const a of ABILITY_KEYS) {
      const mod = abilityMod(scores[a]);
      const resolved = resolveStat(CHAR_ID, `saving-throw.${a}`, mod, ctx, registry, pb);
      expect(resolved.value, `${a} save should include Cloak +1`).toBe(mod + 1);
    }
  });
});

// ── Archetype 9 — High-DEX no proficiency (pure modifier) ─────────────────────

describe('Archetype 9 — High-DEX no proficiency: pure modifier (REQ-NATIVE-03 Scenario 6.9)', () => {
  // PHB p.13 — ability modifier = floor((score-10)/2)
  // PHB p.179 — no proficiency = just ability modifier
  const CHAR_ID = eid('high-dex');
  const scores: Record<AbilityKey, number> = { str: 10, dex: 20, con: 10, int: 10, wis: 10, cha: 10 };
  const pb = 3;

  it('DEX save = +5 (pure mod: DEX 20 → mod +5, no pb, no mods, PHB p.13/p.179)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    // No prof mods registered

    const dexMod = abilityMod(scores.dex);
    expect(dexMod).toBe(5); // DEX 20 → +5

    const resolved = resolveStat(CHAR_ID, 'saving-throw.dex', dexMod, ctx, registry, pb);
    expect(resolved.value).toBe(5); // pure modifier, no pb (not proficient)
  });

  it('STR save = 0 (STR 10 → mod 0, no proficiency, PHB p.13)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const strMod = abilityMod(scores.str);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.str', strMod, ctx, registry, pb);
    expect(resolved.value).toBe(0);
  });

  it('all 6 saves = ability mod only (no proficiency on any, no active effects)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    const expectedValues: Record<AbilityKey, number> = {
      str: 0,  // STR 10 → 0
      dex: 5,  // DEX 20 → +5
      con: 0,  // CON 10 → 0
      int: 0,  // INT 10 → 0
      wis: 0,  // WIS 10 → 0
      cha: 0,  // CHA 10 → 0
    };
    for (const a of ABILITY_KEYS) {
      const mod = abilityMod(scores[a]);
      const resolved = resolveStat(CHAR_ID, `saving-throw.${a}`, mod, ctx, registry, pb);
      expect(resolved.value, `${a} save`).toBe(expectedValues[a]);
    }
  });
});
