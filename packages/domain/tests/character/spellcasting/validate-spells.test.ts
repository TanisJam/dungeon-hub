import { describe, expect, it } from 'vitest';
import { validateClassSpells } from '../../../src/character/spellcasting/validate-spells.js';
import type { SpellLite } from '../../../src/character/spellcasting/validate-spells.js';
import type { AppliedClass } from '../../../src/character/class/types.js';

function mk(slug: string, level: number, subclassSlug: string | null = null): AppliedClass {
  return {
    slug, source: 'PHB', level,
    subclass: subclassSlug ? { slug: subclassSlug, source: 'PHB' } : null,
    hitDie: 'd8', savingThrows: [],
    armorProficiencies: [], weaponProficiencies: [], toolProficiencies: [], skillChoices: [],
  };
}

const wizardSpells: SpellLite[] = [
  { slug: 'fire-bolt', source: 'PHB', level: 0 },
  { slug: 'light', source: 'PHB', level: 0 },
  { slug: 'prestidigitation', source: 'PHB', level: 0 },
  { slug: 'mage-hand', source: 'PHB', level: 0 },
  { slug: 'magic-missile', source: 'PHB', level: 1 },
  { slug: 'shield', source: 'PHB', level: 1 },
  { slug: 'detect-magic', source: 'PHB', level: 1 },
  { slug: 'mage-armor', source: 'PHB', level: 1 },
  { slug: 'misty-step', source: 'PHB', level: 2 },
  { slug: 'fireball', source: 'PHB', level: 3 },
];

describe('validateClassSpells — Wizard (prep + spellbook)', () => {
  it('happy path: L1 con 3 cantrips, 4 known (=spellbook), 2 prepared subset', () => {
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 3,
      availableSpells: wizardSpells,
      input: {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
        ],
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
          { slug: 'detect-magic', source: 'PHB' },
          { slug: 'mage-armor', source: 'PHB' },
        ],
        prepared: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied.prepared).toHaveLength(2);
    expect(r.limits.wizardSpellbookSize).toBe(6);
  });

  it('rechaza preparar un spell que no está en el spellbook (known)', () => {
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 3,
      availableSpells: wizardSpells,
      input: {
        known: [{ slug: 'magic-missile', source: 'PHB' }],
        prepared: [{ slug: 'shield', source: 'PHB' }], // shield no está en known
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'PREPARED_NOT_IN_SPELLBOOK')).toBeDefined();
  });

  it('rechaza preparar más allá del límite (INT mod + nivel)', () => {
    // L1 INT 0 → prep limit 1. Mando 2.
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 0,
      availableSpells: wizardSpells,
      input: {
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
        ],
        prepared: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'PREPARED_LIMIT_EXCEEDED')).toBeDefined();
  });

  it('rechaza spell de nivel > maxSpellLevel para el class level', () => {
    // Wizard L1 maxSpellLevel = 1. Fireball es level 3.
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 3,
      availableSpells: wizardSpells,
      input: {
        known: [{ slug: 'fireball', source: 'PHB' }],
        prepared: [{ slug: 'fireball', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'SPELL_LEVEL_TOO_HIGH')).toBeDefined();
  });

  it('rechaza más cantrips de los permitidos', () => {
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 3,
      availableSpells: wizardSpells,
      input: {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
          { slug: 'prestidigitation', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'CANTRIPS_KNOWN_EXCEEDED')).toBeDefined();
  });

  it('rechaza spell que no está en la lista de la clase', () => {
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 3,
      availableSpells: wizardSpells,
      input: {
        known: [{ slug: 'cure-wounds', source: 'PHB' }], // cleric spell, no en la lista wizard
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'SPELL_NOT_IN_CLASS_LIST')).toBeDefined();
  });

  it('rechaza poner un cantrip en `known` (debe ir en `cantrips`)', () => {
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 3,
      availableSpells: wizardSpells,
      input: {
        known: [{ slug: 'fire-bolt', source: 'PHB' }], // cantrip
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'CANTRIP_EXPECTED')).toBeDefined();
  });
});

describe('validateClassSpells — Cleric (prep desde lista, sin known)', () => {
  const clericSpells: SpellLite[] = [
    { slug: 'sacred-flame', source: 'PHB', level: 0 },
    { slug: 'guidance', source: 'PHB', level: 0 },
    { slug: 'light', source: 'PHB', level: 0 },
    { slug: 'cure-wounds', source: 'PHB', level: 1 },
    { slug: 'bless', source: 'PHB', level: 1 },
  ];

  it('happy path: L1 WIS 3 → 4 prepared, cantrips 3', () => {
    const r = validateClassSpells({
      appliedClass: mk('cleric', 1),
      abilityMod: 3,
      availableSpells: clericSpells,
      input: {
        cantrips: [
          { slug: 'sacred-flame', source: 'PHB' },
          { slug: 'guidance', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
        ],
        prepared: [
          { slug: 'cure-wounds', source: 'PHB' },
          { slug: 'bless', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(true);
  });

  it('rechaza mandar `known` (Cleric prepara de la lista entera)', () => {
    const r = validateClassSpells({
      appliedClass: mk('cleric', 1),
      abilityMod: 3,
      availableSpells: clericSpells,
      input: {
        known: [{ slug: 'cure-wounds', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'KNOWN_NOT_ALLOWED')).toBeDefined();
  });
});

describe('validateClassSpells — Sorcerer (known, sin prep)', () => {
  const sorcSpells: SpellLite[] = [
    { slug: 'fire-bolt', source: 'PHB', level: 0 },
    { slug: 'light', source: 'PHB', level: 0 },
    { slug: 'prestidigitation', source: 'PHB', level: 0 },
    { slug: 'mage-hand', source: 'PHB', level: 0 },
    { slug: 'magic-missile', source: 'PHB', level: 1 },
    { slug: 'shield', source: 'PHB', level: 1 },
  ];

  it('happy path: L1 → 4 cantrips, 2 known', () => {
    const r = validateClassSpells({
      appliedClass: mk('sorcerer', 1),
      abilityMod: 3,
      availableSpells: sorcSpells,
      input: {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
          { slug: 'prestidigitation', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
        ],
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(true);
  });

  it('rechaza mandar `prepared` (Sorcerer no prepara)', () => {
    const r = validateClassSpells({
      appliedClass: mk('sorcerer', 1),
      abilityMod: 3,
      availableSpells: sorcSpells,
      input: {
        prepared: [{ slug: 'shield', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'PREPARED_NOT_ALLOWED')).toBeDefined();
  });

  it('rechaza known > spellsKnown limit', () => {
    const r = validateClassSpells({
      appliedClass: mk('sorcerer', 1),
      abilityMod: 3,
      availableSpells: sorcSpells,
      input: {
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
          { slug: 'fire-bolt', source: 'PHB' }, // cantrip — también va a fallar como NOT_A_CANTRIP
        ],
      },
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateClassSpells — clase no caster', () => {
  it('Barbarian → CLASS_NOT_CASTER', () => {
    const r = validateClassSpells({
      appliedClass: mk('barbarian', 5),
      abilityMod: 3,
      availableSpells: [],
      input: { known: [] },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]?.code).toBe('CLASS_NOT_CASTER');
  });
});

describe('validateClassSpells — duplicados', () => {
  it('reporta duplicate y dedupea', () => {
    const r = validateClassSpells({
      appliedClass: mk('wizard', 1),
      abilityMod: 3,
      availableSpells: wizardSpells,
      input: {
        known: [
          { slug: 'shield', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'DUPLICATE_SPELL')).toBeDefined();
  });
});
