import { describe, expect, it } from 'vitest';
import { hpDeltaForLevelUp, hitDieFaces, hitDieHpGain } from '../../../src/character/level-up/hp-delta.js';

describe('hpDeltaForLevelUp — average', () => {
  it('d10 + CON 2 = 8 (avg 6 + 2)', () => {
    const r = hpDeltaForLevelUp({ hitDie: 'd10', conMod: 2, method: 'average' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBe(8);
    expect(r.method).toBe('average');
    expect(r.rollUsed).toBeNull();
  });
  it('d6 + CON 0 = 4', () => {
    const r = hpDeltaForLevelUp({ hitDie: 'd6', conMod: 0, method: 'average' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBe(4);
  });
  it('mínimo 1: CON muy negativo no baja de 1', () => {
    const r = hpDeltaForLevelUp({ hitDie: 'd6', conMod: -5, method: 'average' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBe(1);
  });
});

describe('hpDeltaForLevelUp — roll', () => {
  it('aplica el roll provisto + CON', () => {
    const r = hpDeltaForLevelUp({ hitDie: 'd10', conMod: 3, method: 'roll', roll: 7 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBe(10);
    expect(r.rollUsed).toBe(7);
    expect(r.method).toBe('roll');
  });
  it('falta de roll → HP_ROLL_REQUIRED', () => {
    const r = hpDeltaForLevelUp({ hitDie: 'd10', conMod: 2, method: 'roll' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]?.code).toBe('HP_ROLL_REQUIRED');
  });
  it('roll fuera de rango → HP_ROLL_OUT_OF_RANGE', () => {
    const r = hpDeltaForLevelUp({ hitDie: 'd8', conMod: 2, method: 'roll', roll: 9 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]?.code).toBe('HP_ROLL_OUT_OF_RANGE');
  });
  it('roll = 0 inválido', () => {
    const r = hpDeltaForLevelUp({ hitDie: 'd8', conMod: 2, method: 'roll', roll: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('hitDieHpGain', () => {
  it('floor es 0, no 1: roll 0 + conMod -1 = 0 (PHB p.186)', () => {
    // PHB p.186: "the character regains hit points equal to the total (minimum of 0)"
    expect(hitDieHpGain(0, -1)).toBe(0);
  });
  it('clamped below zero: roll 1 + conMod -5 = 0 (PHB p.186)', () => {
    // PHB p.186: minimum is 0, not 1 — negative conMod cannot produce negative HP gain
    expect(hitDieHpGain(1, -5)).toBe(0);
  });
  it('caso positivo normal: roll 5 + conMod 2 = 7 (PHB p.186)', () => {
    // PHB p.186: total = roll + conMod, minimum 0
    expect(hitDieHpGain(5, 2)).toBe(7);
  });
  it('conMod cero: roll 8 + conMod 0 = 8 (PHB p.186)', () => {
    // PHB p.186: conMod 0 has no effect
    expect(hitDieHpGain(8, 0)).toBe(8);
  });
});

describe('hitDieFaces', () => {
  it.each([['d6', 6], ['d8', 8], ['d10', 10], ['d12', 12]])('%s = %i', (die, faces) => {
    expect(hitDieFaces(die)).toBe(faces);
  });
  it('inválido throws', () => {
    expect(() => hitDieFaces('invalid')).toThrow();
  });
});
