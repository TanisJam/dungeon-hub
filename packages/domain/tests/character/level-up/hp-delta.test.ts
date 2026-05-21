import { describe, expect, it } from 'vitest';
import { hpDeltaForLevelUp, hitDieFaces } from '../../../src/character/level-up/hp-delta.js';

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

describe('hitDieFaces', () => {
  it.each([['d6', 6], ['d8', 8], ['d10', 10], ['d12', 12]])('%s = %i', (die, faces) => {
    expect(hitDieFaces(die)).toBe(faces);
  });
  it('inválido throws', () => {
    expect(() => hitDieFaces('invalid')).toThrow();
  });
});
