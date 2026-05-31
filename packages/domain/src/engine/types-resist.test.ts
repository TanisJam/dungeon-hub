/**
 * TDD tests for ResistMod (11th Modifier kind) + isResistMod type guard.
 *
 * REQ-RI-06 / ADR-1 / ADR-2
 *
 * PHB p.197 — Damage Resistance and Immunity:
 *   "If a creature or an object has resistance to a damage type, damage of that
 *    type is halved against it. If a creature or an object has immunity to a
 *    damage type, damage of that type is ignored."
 *
 * Strict TDD — RED first.
 */
import { describe, it, expect } from 'vitest';
import { isResistMod } from './types.js';
import type { Modifier, ResistMod } from './types.js';

describe('ResistMod shape + isResistMod guard (REQ-RI-06 / ADR-1)', () => {
  it('ResistMod with mode:"half" is accepted as a valid Modifier (PHB p.197 — resistance)', () => {
    // PHB p.197: resistance halves damage of the matching type
    const mod: ResistMod = {
      kind: 'resist',
      damageType: 'fire',
      mode: 'half',
    };
    // TypeScript compile check: ResistMod must be assignable to Modifier
    const asModifier: Modifier = mod;
    expect(asModifier.kind).toBe('resist');
  });

  it('ResistMod with mode:"immune" is accepted as a valid Modifier (PHB p.197 — immunity)', () => {
    // PHB p.197: immunity reduces damage of the matching type to 0
    const mod: ResistMod = {
      kind: 'resist',
      damageType: 'poison',
      mode: 'immune',
    };
    const asModifier: Modifier = mod;
    expect(asModifier.kind).toBe('resist');
  });

  it('ResistMod with damageType:"all" is accepted (Petrified all-damage resist — PHB p.291)', () => {
    // PHB p.291: Petrified creature has resistance to all damage
    const mod: ResistMod = {
      kind: 'resist',
      damageType: 'all',
      mode: 'half',
    };
    const asModifier: Modifier = mod;
    expect(asModifier.kind).toBe('resist');
  });

  it('isResistMod returns true for a ResistMod', () => {
    const mod: Modifier = { kind: 'resist', damageType: 'cold', mode: 'half' };
    expect(isResistMod(mod)).toBe(true);
  });

  it('isResistMod returns false for a NumMod', () => {
    const mod: Modifier = { kind: 'num', op: 'add', value: 2, stat: 'str', category: 'untyped' };
    expect(isResistMod(mod)).toBe(false);
  });

  it('isResistMod returns false for an AdvantageMod', () => {
    const mod: Modifier = { kind: 'advantage', mode: 'grant', rollType: 'attack' };
    expect(isResistMod(mod)).toBe(false);
  });

  it('Modifier union exhaustive switch still compiles with 11 arms (ADR-1 additive extension)', () => {
    // This function MUST include the resist arm — if missing tsc would error.
    function handleModifier(m: Modifier): string {
      switch (m.kind) {
        case 'num': return 'num';
        case 'advantage': return 'advantage';
        case 'choice': return 'choice';
        case 'concentration': return 'concentration';
        case 'reaction': return 'reaction';
        case 'usage': return 'usage';
        case 'replace': return 'replace';
        case 'gmRuling': return 'gmRuling';
        case 'noop': return 'noop';
        case 'proficiency': return 'proficiency';
        case 'resist': return 'resist';
        default: {
          const _exhaustive: never = m;
          return _exhaustive;
        }
      }
    }

    expect(handleModifier({ kind: 'resist', damageType: 'fire', mode: 'half' })).toBe('resist');
    expect(handleModifier({ kind: 'noop' })).toBe('noop');
  });
});
