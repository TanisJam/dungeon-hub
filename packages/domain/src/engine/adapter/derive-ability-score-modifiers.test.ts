/**
 * Unit tests for deriveAbilityScoreModifiers — adapter that projects the three
 * stored ASI arrays (asisApplied, levelUpAsis, feats) into ModifierInstance[]
 * ready for registration in the modifier registry.
 *
 * Source rules:
 *   PHB p.18-20 — Dwarf / Mountain Dwarf racial ASIs
 *   PHB p.39 — Half-Elf +2 CHA + 2 choice
 *   PHB p.165 — Level-up ASI (4th/8th/12th/16th/19th)
 *   PHB p.168 — Resilient half-feat +1 to chosen ability
 *
 * REQ-AS-ADAPTER-01..05
 */
import { describe, it, expect } from 'vitest';
import { deriveAbilityScoreModifiers } from './derive-ability-score-modifiers.js';
import type { EntityId } from '../types.js';

function eid(s: string): EntityId {
  return s as EntityId;
}

const CHAR_ID = eid('char-test');

// ── REQ-AS-ADAPTER-01 — empty / undefined inputs ─────────────────────────────

describe('deriveAbilityScoreModifiers — empty / undefined inputs (REQ-AS-ADAPTER-01)', () => {
  it('returns [] for completely empty input', () => {
    const result = deriveAbilityScoreModifiers({}, CHAR_ID);
    expect(result).toEqual([]);
  });

  it('returns [] when all arrays are explicitly empty', () => {
    const result = deriveAbilityScoreModifiers(
      { asisApplied: [], levelUpAsis: [], feats: [] },
      CHAR_ID,
    );
    expect(result).toEqual([]);
  });

  it('returns [] when asisApplied is undefined', () => {
    const result = deriveAbilityScoreModifiers(
      { levelUpAsis: [], feats: [] },
      CHAR_ID,
    );
    expect(result).toEqual([]);
  });
});

// ── REQ-AS-ADAPTER-02 — racial / subrace ASI projection ──────────────────────

describe('deriveAbilityScoreModifiers — racial / subrace ASIs (REQ-AS-ADAPTER-02)', () => {
  it('projects single subrace entry → 1 ModifierInstance with correct NumMod shape', () => {
    // PHB p.20 Mountain Dwarf +2 STR (subrace)
    const result = deriveAbilityScoreModifiers(
      { asisApplied: [{ ability: 'str', bonus: 2, source: 'subrace' }] },
      CHAR_ID,
    );
    expect(result).toHaveLength(1);
    const inst = result[0];
    expect(inst).toBeDefined();
    if (!inst) return;
    expect(inst.def.kind).toBe('num');
    if (inst.def.kind !== 'num') return;
    expect(inst.def.op).toBe('add');
    expect(inst.def.stat).toBe('str');
    expect(inst.def.value).toBe(2);
    expect(inst.def.category).toBe('untyped');
    expect(inst.scope.owner).toBe(CHAR_ID);
    expect(inst.scope.target).toEqual({ axis: 'self' });
    expect(inst.scope.trigger).toBe('always');
  });

  it('Mountain Dwarf +2 STR +2 CON → 2 instances', () => {
    // PHB p.18 (Dwarf +2 CON), PHB p.20 (Mountain Dwarf +2 STR)
    const result = deriveAbilityScoreModifiers(
      {
        asisApplied: [
          { ability: 'str', bonus: 2, source: 'subrace' },
          { ability: 'con', bonus: 2, source: 'subrace' },
        ],
      },
      CHAR_ID,
    );
    expect(result).toHaveLength(2);
    const str = result.find((i) => i.def.kind === 'num' && i.def.stat === 'str');
    const con = result.find((i) => i.def.kind === 'num' && i.def.stat === 'con');
    expect(str).toBeDefined();
    expect(con).toBeDefined();
    if (!str || str.def.kind !== 'num') return;
    if (!con || con.def.kind !== 'num') return;
    expect(str.def.value).toBe(2);
    expect(con.def.value).toBe(2);
  });

  it('race source produces label containing "Racial ASI" — provenance guardrail (ledger §4b)', () => {
    // PHB p.39 Half-Elf +2 CHA (source: 'race')
    // Label MUST NOT contain hardcoded race name (§4b). Generic label only.
    const result = deriveAbilityScoreModifiers(
      { asisApplied: [{ ability: 'cha', bonus: 2, source: 'race' }] },
      CHAR_ID,
    );
    expect(result).toHaveLength(1);
    const label = result[0]?.label ?? '';
    expect(label).toMatch(/Racial ASI/i);
    // Must NOT contain hardcoded race names (§4b guardrail)
    expect(label).not.toMatch(/half.?elf|mountain|dwarf|human|elf/i);
  });

  it('subrace source produces label containing "Subrace ASI" — provenance guardrail (ledger §4b)', () => {
    const result = deriveAbilityScoreModifiers(
      { asisApplied: [{ ability: 'con', bonus: 2, source: 'subrace' }] },
      CHAR_ID,
    );
    const label = result[0]?.label ?? '';
    expect(label).toMatch(/Subrace ASI/i);
  });
});

// ── REQ-AS-ADAPTER-03 — level-up ASI projection ──────────────────────────────

describe('deriveAbilityScoreModifiers — level-up ASI (REQ-AS-ADAPTER-03)', () => {
  it('projects single levelUpAsis entry → 1 instance with correct stat/value', () => {
    // PHB p.165 — level 4 +2 STR
    const result = deriveAbilityScoreModifiers(
      { levelUpAsis: [{ ability: 'str', bonus: 2, source: 'levelup' }] },
      CHAR_ID,
    );
    expect(result).toHaveLength(1);
    const inst = result[0];
    expect(inst).toBeDefined();
    if (!inst) return;
    expect(inst.def.kind).toBe('num');
    if (inst.def.kind !== 'num') return;
    expect(inst.def.stat).toBe('str');
    expect(inst.def.value).toBe(2);
    expect(inst.def.category).toBe('untyped');
  });

  it('level-up label references level-up origin', () => {
    const result = deriveAbilityScoreModifiers(
      { levelUpAsis: [{ ability: 'str', bonus: 2, source: 'levelup' }] },
      CHAR_ID,
    );
    const label = result[0]?.label ?? '';
    expect(label).toMatch(/Level-up ASI/i);
  });
});

// ── REQ-AS-ADAPTER-04 — feat ASI projection ──────────────────────────────────

describe('deriveAbilityScoreModifiers — feat ASIs (REQ-AS-ADAPTER-04)', () => {
  it('projects feat asisApplied entry → 1 instance with correct stat/value', () => {
    // PHB p.168 Resilient CON +1
    const result = deriveAbilityScoreModifiers(
      {
        feats: [{ slug: 'resilient', source: 'PHB', asisApplied: [{ ability: 'con', bonus: 1 }] }],
      },
      CHAR_ID,
    );
    expect(result).toHaveLength(1);
    const inst = result[0];
    expect(inst).toBeDefined();
    if (!inst) return;
    expect(inst.def.kind).toBe('num');
    if (inst.def.kind !== 'num') return;
    expect(inst.def.stat).toBe('con');
    expect(inst.def.value).toBe(1);
  });

  it('feat label includes the feat slug', () => {
    const result = deriveAbilityScoreModifiers(
      {
        feats: [{ slug: 'resilient', source: 'PHB', asisApplied: [{ ability: 'con', bonus: 1 }] }],
      },
      CHAR_ID,
    );
    const label = result[0]?.label ?? '';
    expect(label).toMatch(/Feat \(resilient\)/i);
  });
});

// ── Design §2 — zero-bonus entries skipped ───────────────────────────────────

describe('deriveAbilityScoreModifiers — zero-bonus skip (design §2)', () => {
  it('skips entries with bonus === 0', () => {
    const result = deriveAbilityScoreModifiers(
      {
        asisApplied: [
          { ability: 'str', bonus: 0, source: 'race' },
          { ability: 'con', bonus: 2, source: 'subrace' },
        ],
      },
      CHAR_ID,
    );
    // Only the +2 CON survives; the +0 STR is dropped
    expect(result).toHaveLength(1);
    const first = result[0];
    if (first?.def.kind === 'num') {
      expect(first.def.stat).toBe('con');
    }
  });
});

// ── REQ-AS-ADAPTER-05 — all three sources compose additively ─────────────────

describe('deriveAbilityScoreModifiers — all sources compose (REQ-AS-ADAPTER-05)', () => {
  it('racial + level-up + feat → flat array, count = sum of all non-zero entries', () => {
    // PHB p.13 — ability scores are sums; no keep-highest between ASI sources
    const result = deriveAbilityScoreModifiers(
      {
        asisApplied: [
          { ability: 'str', bonus: 2, source: 'subrace' }, // Mountain Dwarf +2 STR
          { ability: 'con', bonus: 2, source: 'subrace' }, // Mountain Dwarf +2 CON (PHB p.18)
        ],
        levelUpAsis: [
          { ability: 'str', bonus: 2, source: 'levelup' }, // L4 ASI (PHB p.165)
        ],
        feats: [
          { slug: 'resilient', source: 'PHB', asisApplied: [{ ability: 'con', bonus: 1 }] }, // Resilient CON (PHB p.168)
        ],
      },
      CHAR_ID,
    );
    // 2 racial + 1 level-up + 1 feat = 4 instances
    expect(result).toHaveLength(4);
    // STR instances: racial+2 + levelup+2 = net 4 when summed (no dedup)
    const strInstances = result.filter((i) => i.def.kind === 'num' && i.def.stat === 'str');
    expect(strInstances).toHaveLength(2);
    const strNet = strInstances.reduce((acc, i) => {
      if (i.def.kind !== 'num') return acc;
      return acc + (i.def.value as number);
    }, 0);
    expect(strNet).toBe(4);
  });
});
