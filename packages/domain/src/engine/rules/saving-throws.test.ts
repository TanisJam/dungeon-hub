/**
 * Parity gate corpus — engine saving throw resolution vs legacy compute.ts formula.
 *
 * Gate A form: engine === legacyEquivalent
 * (Gate B: convert to literal values in Commit 3, after legacy deletion)
 *
 * 9 archetypes covering:
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
 * REQ-GATE-01, REQ-NATIVE-01..03, REQ-MULTI-01
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

/** Legacy formula — inline replica of compute.ts:390-394 */
function legacySave(score: number, proficient: boolean, pb: number): number {
  return abilityMod(score) + (proficient ? pb : 0);
}

interface SaveResult {
  value: number;
  proficient: boolean;
}

/**
 * Resolve all 6 saves via engine and assert engine.value === legacySave for each.
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

  // Register save proficiency mods (adapter)
  const saveProfMods = deriveSavingThrowProficiencies(profSaves, charId);
  for (const m of saveProfMods) registry.register(m);

  // Allow caller to register additional mods (Bless, Cloak, Resilient)
  extraSetup?.(registry);

  const results: Partial<Record<AbilityKey, SaveResult>> = {};
  for (const a of ABILITY_KEYS) {
    const abilityModifier = abilityMod(scores[a]);
    const resolved = resolveStat(charId, `saving-throw.${a}`, abilityModifier, ctx, registry, pb);
    results[a] = { value: resolved.value, proficient: profSaves.includes(a) };
  }
  return results as Record<AbilityKey, SaveResult>;
}

// ── Archetype 1 — Fighter L5 (STR+CON prof) ──────────────────────────────────

describe('Archetype 1 — Fighter L5 STR+CON proficient (REQ-GATE-01 Scenario 6.1)', () => {
  // PHB p.72 — Fighter saving throws: Strength and Constitution
  // PHB p.179 — saving throw modifier = ability modifier + proficiency bonus (if proficient)
  const CHAR_ID = eid('fighter-l5');
  const scores: Record<AbilityKey, number> = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
  const profSaves: AbilityKey[] = ['str', 'con'];
  const pb = 3; // PHB p.15 — L5 proficiency bonus = +3

  const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);

  it('STR save = legacyEquivalent (proficient, PHB p.72/p.179)', () => {
    // legacy-captured: 6 (STR mod+3 + PB+3)
    const legacy = legacySave(scores.str, true, pb);
    expect(saves.str.value).toBe(legacy);
    expect(saves.str.proficient).toBe(true);
  });

  it('CON save = legacyEquivalent (proficient, PHB p.72)', () => {
    // legacy-captured: 5 (CON mod+2 + PB+3)
    const legacy = legacySave(scores.con, true, pb);
    expect(saves.con.value).toBe(legacy);
    expect(saves.con.proficient).toBe(true);
  });

  it('DEX save = legacyEquivalent (not proficient)', () => {
    // legacy-captured: 1 (DEX mod+1, no PB)
    const legacy = legacySave(scores.dex, false, pb);
    expect(saves.dex.value).toBe(legacy);
    expect(saves.dex.proficient).toBe(false);
  });

  it('all 6 saves engine === legacy', () => {
    for (const a of ABILITY_KEYS) {
      const legacy = legacySave(scores[a], profSaves.includes(a), pb);
      expect(saves[a].value, `${a} save should be ${legacy}`).toBe(legacy);
    }
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

  it('INT save = legacyEquivalent (proficient, PHB p.114)', () => {
    // legacy-captured: 6 (INT mod+3 + PB+3)
    const legacy = legacySave(scores.int, true, pb);
    expect(saves.int.value).toBe(legacy);
  });

  it('WIS save = legacyEquivalent (proficient, PHB p.114)', () => {
    // legacy-captured: 5 (WIS mod+2 + PB+3)
    const legacy = legacySave(scores.wis, true, pb);
    expect(saves.wis.value).toBe(legacy);
  });

  it('all 6 saves engine === legacy', () => {
    for (const a of ABILITY_KEYS) {
      const legacy = legacySave(scores[a], profSaves.includes(a), pb);
      expect(saves[a].value, `${a} save`).toBe(legacy);
    }
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

  it('WIS save = legacyEquivalent (proficient, PHB p.105)', () => {
    // legacy-captured: 6 (WIS mod+3 + PB+3)
    const legacy = legacySave(scores.wis, true, pb);
    expect(saves.wis.value).toBe(legacy);
  });

  it('CHA save = legacyEquivalent (proficient, PHB p.105)', () => {
    // legacy-captured: 5 (CHA mod+2 + PB+3)
    const legacy = legacySave(scores.cha, true, pb);
    expect(saves.cha.value).toBe(legacy);
  });

  it('all 6 saves engine === legacy', () => {
    for (const a of ABILITY_KEYS) {
      const legacy = legacySave(scores[a], profSaves.includes(a), pb);
      expect(saves[a].value, `${a} save`).toBe(legacy);
    }
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

  it('DEX save = legacyEquivalent (proficient, PHB p.95)', () => {
    // legacy-captured: 6 (DEX mod+3 + PB+3)
    const legacy = legacySave(scores.dex, true, pb);
    expect(saves.dex.value).toBe(legacy);
  });

  it('INT save = legacyEquivalent (proficient, PHB p.95)', () => {
    // legacy-captured: 5 (INT mod+2 + PB+3)
    const legacy = legacySave(scores.int, true, pb);
    expect(saves.int.value).toBe(legacy);
  });

  it('all 6 saves engine === legacy', () => {
    for (const a of ABILITY_KEYS) {
      const legacy = legacySave(scores[a], profSaves.includes(a), pb);
      expect(saves[a].value, `${a} save`).toBe(legacy);
    }
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
  // PRIMARY CLASS = Wizard → savingThrows: ['int', 'wis']
  // Fighter's saves NOT granted (PHB p.164)
  const profSaves: AbilityKey[] = ['int', 'wis'];
  const pb = 2; // L4 total, PB=2

  const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);

  it('INT proficient (Wizard class save, PHB p.114/p.164)', () => {
    // legacy-captured: 5 (INT mod+3 + PB+2)
    const legacy = legacySave(scores.int, true, pb);
    expect(saves.int.value).toBe(legacy);
    expect(saves.int.proficient).toBe(true);
  });

  it('WIS proficient (Wizard class save)', () => {
    // legacy-captured: 4 (WIS mod+2 + PB+2)
    const legacy = legacySave(scores.wis, true, pb);
    expect(saves.wis.value).toBe(legacy);
    expect(saves.wis.proficient).toBe(true);
  });

  it('STR NOT proficient (Fighter saves not granted on multiclass, PHB p.164)', () => {
    // legacy-captured: 0 (STR mod+0, no PB)
    const legacy = legacySave(scores.str, false, pb);
    expect(saves.str.value).toBe(legacy);
    expect(saves.str.proficient).toBe(false);
  });

  it('CON NOT proficient (Fighter saves not granted on multiclass, PHB p.164)', () => {
    // legacy-captured: 1 (CON mod+1, no PB)
    const legacy = legacySave(scores.con, false, pb);
    expect(saves.con.value).toBe(legacy);
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
  // DOMAIN-LEVEL ONLY: route does NOT register Resilient. This test calls the adapter
  // + buildResilientConModifiers directly to prove the engine behavior (ADR-4).
  const CHAR_ID = eid('fighter-resilient');
  const scores: Record<AbilityKey, number> = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
  const profSaves: AbilityKey[] = ['str', 'con'];
  const pb = 3;

  it('CON save = abilityMod + 2*pb (double-count surfaces, PHB p.168/p.72)', () => {
    // PHB p.168: Resilient grants ADDITIONAL CON save proficiency.
    // Engine shows 2*pb because BOTH class + feat ProficiencyMods are present.
    // Legacy would deduplicate via Set — this is the class (a) divergence.
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    // Class saves (adapter)
    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);

    // Resilient(Con) ALSO grants con save (domain-level — NOT wired in route per ADR-4)
    const resilientMods = buildResilientConModifiers(CHAR_ID);
    for (const m of resilientMods) registry.register(m);

    const conMod = abilityMod(scores.con);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.con', conMod, ctx, registry, pb);

    // Engine surfaces the double-count: abilityMod + 2*pb (two ProficiencyMods registered)
    expect(resolved.value).toBe(conMod + 2 * pb);
    // legacy-captured: 2 + 2*3 = 8 (diverges from legacy which deduplicates via Set)
  });

  it('STR save = abilityMod + pb (single proficiency, no divergence)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);
    const resilientMods = buildResilientConModifiers(CHAR_ID);
    for (const m of resilientMods) registry.register(m);

    const strMod = abilityMod(scores.str);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.str', strMod, ctx, registry, pb);
    // legacy-captured: 3+3 = 6
    expect(resolved.value).toBe(strMod + pb);
  });
});

// ── Archetype 7 — Fighter + Bless active (all-saves fan-out) ─────────────────

describe('Archetype 7 — Fighter L5 + Bless (+1d4 all saves fan-out, Scenario 6.7)', () => {
  // PHB p.219 — Bless: "+1d4 to attack rolls and saving throws"
  // NumMod{stat:'saving-throw', value:'1d4'} applies to ALL per-ability saves
  // via the engine's all-saves fan-out (stat.ts ~line 133).
  // Dice string '1d4' contributes value=0 to the numeric total; it appears in breakdown[].
  //
  // Equivalence class (c): engine matches legacy + active-effects behavior.
  const CHAR_ID = eid('fighter-bless');
  const CASTER_ID = eid('caster');
  const scores: Record<AbilityKey, number> = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
  const profSaves: AbilityKey[] = ['str', 'con'];
  const pb = 3;
  const TOKEN = 'test-bless-tok';

  it('STR save (proficient) has Bless source in breakdown (PHB p.219)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);

    // Bless emits stat:'saving-throw' (flat all-saves key) — fans out to all per-ability saves
    const blessMods = buildBlessModifiers(CASTER_ID, [CHAR_ID], TOKEN);
    for (const m of blessMods) registry.register(m);

    const strMod = abilityMod(scores.str);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.str', strMod, ctx, registry, pb);

    // Value: +3 (STR mod) + 3 (pb) = 6 (dice '1d4' stays as 0 in numeric .value)
    // legacy-captured: 6 (numeric part; Bless is a dice roll, not a flat number)
    expect(resolved.value).toBe(strMod + pb);

    // Bless MUST appear in breakdown (dice source traceability)
    const blessSource = resolved.breakdown.find((s) => s.label?.includes('Bless'));
    expect(blessSource, 'Bless should appear in STR save breakdown').toBeDefined();
    expect(blessSource!.amount).toBe('1d4');
    expect(blessSource!.type).toBe('untyped');
  });

  it('DEX save (not proficient) also has Bless fan-out (PHB p.219)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    const saveProfMods = deriveSavingThrowProficiencies(profSaves, CHAR_ID);
    for (const m of saveProfMods) registry.register(m);

    const blessMods = buildBlessModifiers(CASTER_ID, [CHAR_ID], TOKEN);
    for (const m of blessMods) registry.register(m);

    const dexMod = abilityMod(scores.dex);
    const resolved = resolveStat(CHAR_ID, 'saving-throw.dex', dexMod, ctx, registry, pb);

    // Value: +1 (DEX mod) = 1 (no proficiency, +1d4 dice is 0 numeric)
    // legacy-captured: 1
    expect(resolved.value).toBe(dexMod);

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
  const profSaves: AbilityKey[] = []; // no class save profs for simplicity
  const pb = 2;

  it('every per-ability save includes +1 from Cloak (DMG p.159)', () => {
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);

    // No class saves for this archetype
    const cloakMods = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-inst-1');
    for (const m of cloakMods) registry.register(m);

    for (const a of ABILITY_KEYS) {
      const mod = abilityMod(scores[a]);
      const resolved = resolveStat(CHAR_ID, `saving-throw.${a}`, mod, ctx, registry, pb);
      // Each save = ability mod + 1 (Cloak flat bonus)
      // legacy-captured: mod+1 (Cloak adds +1 to each save via all-saves fan-out)
      const legacy = mod + 1; // no proficiency + Cloak +1
      expect(resolved.value, `${a} save should include Cloak +1`).toBe(legacy);
    }
  });
});

// ── Archetype 9 — High-DEX no proficiency (pure modifier) ─────────────────────

describe('Archetype 9 — High-DEX no proficiency: pure modifier (REQ-NATIVE-03 Scenario 6.9)', () => {
  // PHB p.13 — ability modifier = floor((score-10)/2)
  // PHB p.179 — no proficiency = just ability modifier
  const CHAR_ID = eid('high-dex');
  const scores: Record<AbilityKey, number> = { str: 10, dex: 20, con: 10, int: 10, wis: 10, cha: 10 };
  const profSaves: AbilityKey[] = []; // no proficiencies
  const pb = 3;

  it('DEX save = +5 (pure mod, no pb, no mods — PHB p.13/p.179)', () => {
    // legacy-captured: 5 (DEX mod +5, no PB, no active effects)
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(CHAR_ID);
    // No saves registered (empty prof list)

    const dexMod = abilityMod(scores.dex);
    expect(dexMod).toBe(5); // DEX 20 → +5

    const resolved = resolveStat(CHAR_ID, 'saving-throw.dex', dexMod, ctx, registry, pb);
    const legacy = legacySave(scores.dex, false, pb);

    expect(resolved.value).toBe(legacy); // = 5
    expect(resolved.value).toBe(5);
  });

  it('all 6 saves = ability mod only, engine === legacy', () => {
    const saves = resolveSaves(CHAR_ID, scores, profSaves, pb);
    for (const a of ABILITY_KEYS) {
      const legacy = legacySave(scores[a], false, pb);
      expect(saves[a].value, `${a} save`).toBe(legacy);
    }
  });
});
