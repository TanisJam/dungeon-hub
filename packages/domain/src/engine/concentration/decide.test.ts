/**
 * TDD tests — engine-concentration-authority (Batch A)
 *
 * Covers:
 *   - REQ-CONC-02: One concentration spell at a time (PHB p.203)
 *   - REQ-CONC-04: Non-concentration spells do not affect concentration (PHB p.203)
 *
 * Strict TDD — tests written RED first, each RED→GREEN cycle documented.
 *
 * PHB p.203 — Concentration:
 *   "You lose concentration on a spell if you cast another spell that requires
 *    concentration."
 *   Only spells that REQUIRE concentration trigger the drop.
 *   Non-concentration spells cast while concentrating leave the active
 *   concentration entry untouched.
 */
import { describe, it, expect } from 'vitest';
import { decideConcentration } from './decide.js';
import type { ConcentrationEntry, ConcentrationCandidate, ConcentrationDecision } from './decide.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const priorBless: ConcentrationEntry = {
  store: 'modifier_instances',
  token: 'prior-token-bless',
  spellName: 'Bless',
};

const incomingBless: ConcentrationCandidate = {
  store: 'modifier_instances',
  token: 'new-token-bless',
  spellName: 'Bless',
  requiresConcentration: true,
};

const incomingHex: ConcentrationCandidate = {
  store: 'encounter_combatant_effects',
  token: 'new-token-hex',
  spellName: 'Hex',
  requiresConcentration: true,
};

const incomingMagicMissile: ConcentrationCandidate = {
  store: 'modifier_instances',
  token: 'new-token-mm',
  spellName: 'Magic Missile',
  requiresConcentration: false,
};

// ── Cycle 1 — No prior concentration, cast concentration spell (REQ-CONC-02) ──

describe('decideConcentration — no prior, incoming concentration spell (REQ-CONC-02)', () => {
  it('returns register with new entry, no dropPrior, no noOp', () => {
    // PHB p.203: caster not concentrating → begins new concentration cleanly.
    // No prior entry to drop; the new spell becomes the active concentration.
    const result: ConcentrationDecision = decideConcentration(null, incomingBless);

    expect('noOp' in result).toBe(false);
    // Narrow: it must be the register branch
    if ('noOp' in result) throw new Error('unexpected noOp');
    expect(result.register).toEqual({
      store: incomingBless.store,
      token: incomingBless.token,
      spellName: incomingBless.spellName,
    });
    expect(result.dropPrior).toBeUndefined();
  });
});

// ── Cycle 2 — Prior concentration, cast same-store concentration spell (REQ-CONC-02) ──

describe('decideConcentration — prior same-store, incoming concentration spell (REQ-CONC-02)', () => {
  it('drops prior Bless token and registers new Bless cast — same store (PHB p.203)', () => {
    // PHB p.203: "You lose concentration on a spell if you cast another spell
    // that requires concentration." Both in modifier_instances here.
    const result: ConcentrationDecision = decideConcentration(priorBless, incomingBless);

    expect('noOp' in result).toBe(false);
    if ('noOp' in result) throw new Error('unexpected noOp');
    expect(result.dropPrior).toEqual({
      store: priorBless.store,
      token: priorBless.token,
    });
    expect(result.register).toEqual({
      store: incomingBless.store,
      token: incomingBless.token,
      spellName: incomingBless.spellName,
    });
  });
});

// ── Cycle 3 — Prior concentration (modifier_instances), cast cross-store spell (REQ-CONC-02 + REQ-CONC-03) ──

describe('decideConcentration — prior modifier_instances, incoming encounter_combatant_effects (REQ-CONC-03)', () => {
  it('drops prior Bless (modifier_instances) and registers new Hex (encounter_combatant_effects) — PHB p.203 cross-store', () => {
    // PHB p.203: the rule does not distinguish by storage mechanism.
    // Bless→Hex: prior in modifier_instances, new in encounter_combatant_effects.
    const result: ConcentrationDecision = decideConcentration(priorBless, incomingHex);

    expect('noOp' in result).toBe(false);
    if ('noOp' in result) throw new Error('unexpected noOp');
    expect(result.dropPrior).toEqual({
      store: 'modifier_instances',
      token: priorBless.token,
    });
    expect(result.register).toEqual({
      store: 'encounter_combatant_effects',
      token: incomingHex.token,
      spellName: incomingHex.spellName,
    });
  });

  it('drops prior Hex (encounter_combatant_effects) and registers new Bless (modifier_instances) — PHB p.203 cross-store mirror', () => {
    // PHB p.203: Hex→Bless mirror scenario. Store is reversed from cycle 3.
    const priorHex: ConcentrationEntry = {
      store: 'encounter_combatant_effects',
      token: 'prior-token-hex',
      spellName: 'Hex',
    };
    const result: ConcentrationDecision = decideConcentration(priorHex, incomingBless);

    expect('noOp' in result).toBe(false);
    if ('noOp' in result) throw new Error('unexpected noOp');
    expect(result.dropPrior).toEqual({
      store: 'encounter_combatant_effects',
      token: priorHex.token,
    });
    expect(result.register).toEqual({
      store: 'modifier_instances',
      token: incomingBless.token,
      spellName: incomingBless.spellName,
    });
  });
});

// ── Cycle 4 — Non-concentration spell cast while concentrating (REQ-CONC-04) ──

describe('decideConcentration — incoming non-concentration spell (REQ-CONC-04)', () => {
  it('returns noOp when incoming spell does not require concentration — PHB p.203', () => {
    // PHB p.203: "only spells that require concentration trigger the drop."
    // Magic Missile (requiresConcentration=false) → no change to active concentration.
    const result: ConcentrationDecision = decideConcentration(priorBless, incomingMagicMissile);

    expect(result).toEqual({ noOp: true });
  });

  it('returns noOp when no prior concentration and incoming spell does not require concentration', () => {
    // No prior, non-concentration spell → nothing to do.
    const result: ConcentrationDecision = decideConcentration(null, incomingMagicMissile);

    expect(result).toEqual({ noOp: true });
  });
});
