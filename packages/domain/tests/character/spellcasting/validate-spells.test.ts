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

// ── SP-07: Warlock (known + pact magic, no prepared) ──────────────────────

describe('validateClassSpells — Warlock (SP-07)', () => {
  // PHB p.107: Warlock L1 — 2 cantrips known, 2 spells known, pact slots (not prepared)
  const warlockSpells: SpellLite[] = [
    { slug: 'eldritch-blast', source: 'PHB', level: 0 },
    { slug: 'mage-hand', source: 'PHB', level: 0 },
    { slug: 'prestidigitation', source: 'PHB', level: 0 }, // extra cantrip for over-limit test
    { slug: 'hex', source: 'PHB', level: 1 },
    { slug: 'armor-of-agathys', source: 'PHB', level: 1 },
    { slug: 'hellish-rebuke', source: 'PHB', level: 1 },  // extra spell for over-limit test
  ];

  it('REQ-SP07-WARLOCK-VALIDATE-PICKS: happy path — L1 2 cantrips + 2 known → ok:true (PHB p.107)', () => {
    // PHB p.107: Warlock L1 has cantrips_known=2, spells_known=2
    const r = validateClassSpells({
      appliedClass: mk('warlock', 1, 'fiend'),
      abilityMod: 3,
      availableSpells: warlockSpells,
      input: {
        cantrips: [
          { slug: 'eldritch-blast', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
        ],
        known: [
          { slug: 'hex', source: 'PHB' },
          { slug: 'armor-of-agathys', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(true);
  });

  it('REQ-SP07-WARLOCK-VALIDATE-PICKS: prepared field non-null → PREPARED_NOT_ALLOWED (PHB p.107)', () => {
    // PHB p.107: Warlock uses spells known, not prepared
    const r = validateClassSpells({
      appliedClass: mk('warlock', 1, 'fiend'),
      abilityMod: 3,
      availableSpells: warlockSpells,
      input: {
        prepared: [{ slug: 'hex', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'PREPARED_NOT_ALLOWED')).toBeDefined();
  });

  it('REQ-SP07-WARLOCK-VALIDATE-PICKS: 3 known (over limit=2) → SPELLS_KNOWN_EXCEEDED (PHB p.107)', () => {
    // PHB p.107: Warlock L1 can only know 2 spells
    const r = validateClassSpells({
      appliedClass: mk('warlock', 1, 'fiend'),
      abilityMod: 3,
      availableSpells: warlockSpells,
      input: {
        known: [
          { slug: 'hex', source: 'PHB' },
          { slug: 'armor-of-agathys', source: 'PHB' },
          { slug: 'hellish-rebuke', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'SPELLS_KNOWN_EXCEEDED')).toBeDefined();
  });
});

// ── SP-07: Arcane Trickster Rogue ─────────────────────────────────────────

describe('validateClassSpells — Rogue / Arcane Trickster (SP-07)', () => {
  const atSpells: SpellLite[] = [
    { slug: 'mage-hand', source: 'PHB', level: 0 },
    { slug: 'minor-illusion', source: 'PHB', level: 0 },
    { slug: 'prestidigitation', source: 'PHB', level: 0 },
    { slug: 'silent-image', source: 'PHB', level: 1 },
    { slug: 'disguise-self', source: 'PHB', level: 1 },
    { slug: 'charm-person', source: 'PHB', level: 1 },
    { slug: 'mirror-image', source: 'PHB', level: 2 }, // L2 for over-limit test
  ];

  it('REQ-SP07-AT-L1-NO-PICKS: Rogue L1 without subclass → CLASS_NOT_CASTER (PHB p.97)', () => {
    // PHB p.97: Arcane Trickster subclass is unlocked at Rogue L3; L1 has no spellcasting
    const r = validateClassSpells({
      appliedClass: mk('rogue', 1),
      abilityMod: 3,
      availableSpells: atSpells,
      input: { known: [] },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'CLASS_NOT_CASTER')).toBeDefined();
  });

  it('REQ-SP07-AT-L3-SPELLS: Rogue L3 AT happy path — 3 cantrips + 3 known maxLvl 1 → ok:true (PHB p.97-98)', () => {
    // PHB p.97-98: AT L3 → 3 cantrips known, 3 spells known, max spell level 1
    const r = validateClassSpells({
      appliedClass: mk('rogue', 3, 'arcane-trickster'),
      abilityMod: 3,
      availableSpells: atSpells,
      input: {
        cantrips: [
          { slug: 'mage-hand', source: 'PHB' },
          { slug: 'minor-illusion', source: 'PHB' },
          { slug: 'prestidigitation', source: 'PHB' },
        ],
        known: [
          { slug: 'silent-image', source: 'PHB' },
          { slug: 'disguise-self', source: 'PHB' },
          { slug: 'charm-person', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(true);
  });

  it('REQ-SP07-AT-L3-SPELLS: Rogue L3 AT with L2 spell in known → SPELL_LEVEL_TOO_HIGH (PHB p.97-98)', () => {
    // PHB p.97-98: AT L3 can only access L1 spells; L2 slots unlock at higher levels
    const r = validateClassSpells({
      appliedClass: mk('rogue', 3, 'arcane-trickster'),
      abilityMod: 3,
      availableSpells: atSpells,
      input: {
        known: [{ slug: 'mirror-image', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'SPELL_LEVEL_TOO_HIGH')).toBeDefined();
  });
});

// ── SP-07: Eldritch Knight Fighter ───────────────────────────────────────

describe('validateClassSpells — Fighter / Eldritch Knight (SP-07)', () => {
  const ekSpells: SpellLite[] = [
    { slug: 'fire-bolt', source: 'PHB', level: 0 },
    { slug: 'shocking-grasp', source: 'PHB', level: 0 },
    { slug: 'blade-ward', source: 'PHB', level: 0 }, // extra cantrip
    { slug: 'shield', source: 'PHB', level: 1 },
    { slug: 'absorb-elements', source: 'PHB', level: 1 },
    { slug: 'burning-hands', source: 'PHB', level: 1 },
    { slug: 'shatter', source: 'PHB', level: 2 }, // L2 for over-limit test
  ];

  it('REQ-SP07-EK-L1-NO-PICKS: Fighter L1 without EK subclass → CLASS_NOT_CASTER (PHB p.74)', () => {
    // PHB p.74: Eldritch Knight subclass unlocks at Fighter L3; L1 has no spellcasting
    const r = validateClassSpells({
      appliedClass: mk('fighter', 1),
      abilityMod: 3,
      availableSpells: ekSpells,
      input: { known: [] },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'CLASS_NOT_CASTER')).toBeDefined();
  });

  it('REQ-SP07-EK-L3-SPELLS: Fighter L3 EK happy path — 2 cantrips + 3 known maxLvl 1 → ok:true (PHB p.74)', () => {
    // PHB p.74: EK L3 → 2 cantrips known, 3 spells known, max spell level 1
    const r = validateClassSpells({
      appliedClass: mk('fighter', 3, 'eldritch-knight'),
      abilityMod: 3,
      availableSpells: ekSpells,
      input: {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'shocking-grasp', source: 'PHB' },
        ],
        known: [
          { slug: 'shield', source: 'PHB' },
          { slug: 'absorb-elements', source: 'PHB' },
          { slug: 'burning-hands', source: 'PHB' },
        ],
      },
    });
    expect(r.ok).toBe(true);
  });

  it('REQ-SP07-EK-L3-SPELLS: Fighter L3 EK with L2 spell in known → SPELL_LEVEL_TOO_HIGH (PHB p.74)', () => {
    // PHB p.74: EK L3 max spell level = 1; L2 slots unlock at L7
    const r = validateClassSpells({
      appliedClass: mk('fighter', 3, 'eldritch-knight'),
      abilityMod: 3,
      availableSpells: ekSpells,
      input: {
        known: [{ slug: 'shatter', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.find((i) => i.code === 'SPELL_LEVEL_TOO_HIGH')).toBeDefined();
  });
});

// ── SP-07: Paladin L1 + Ranger L1 (zero slots / zero known) ──────────────

describe('validateClassSpells — half-casters at L1 (SP-07)', () => {
  const halfCasterSpells: SpellLite[] = [
    { slug: 'cure-wounds', source: 'PHB', level: 1 },
    { slug: 'hunters-mark', source: 'PHB', level: 1 },
  ];

  it('REQ-SP07-PALADIN-L1-ZERO-SPELLS: Paladin L1 — prepared limit = 0; sending prepared → PREPARED_LIMIT_EXCEEDED (PHB p.207)', () => {
    // PHB p.84/p.207: Paladin is a half-caster; spell slots (and thus prepared spells) start at L2
    const r = validateClassSpells({
      appliedClass: mk('paladin', 1),
      abilityMod: 3,
      availableSpells: halfCasterSpells,
      input: {
        prepared: [{ slug: 'cure-wounds', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // No slots at L1 → prepared limit = 0 → PREPARED_LIMIT_EXCEEDED or class not caster
    const hasPreparedIssue = r.issues.some(
      (i) => i.code === 'PREPARED_LIMIT_EXCEEDED' || i.code === 'CLASS_NOT_CASTER',
    );
    expect(hasPreparedIssue).toBe(true);
  });

  it('REQ-SP07-RANGER-L1-ZERO-SPELLS: Ranger L1 — spells known = 0; sending known → SPELLS_KNOWN_EXCEEDED (PHB p.207)', () => {
    // PHB p.91/p.207: Ranger is a half-caster; spells known start at L2
    const r = validateClassSpells({
      appliedClass: mk('ranger', 1),
      abilityMod: 3,
      availableSpells: halfCasterSpells,
      input: {
        known: [{ slug: 'hunters-mark', source: 'PHB' }],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const hasKnownIssue = r.issues.some(
      (i) => i.code === 'SPELLS_KNOWN_EXCEEDED' || i.code === 'CLASS_NOT_CASTER',
    );
    expect(hasKnownIssue).toBe(true);
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
