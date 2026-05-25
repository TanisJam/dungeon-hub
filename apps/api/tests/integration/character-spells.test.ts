import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * PUT /characters/:id/classes/:classSlug/spells — selección de cantrips/known/prepared
 * por clase. Reglas por tipo de caster (prep vs known vs Wizard spellbook).
 */
describe('PUT /characters/:id/classes/:classSlug/spells', () => {
  let user: TestUser;
  let campaignId: string;
  let wizardCharId: string;
  let wizardL4AsiCharId: string;
  let clericCharId: string;
  let sorcCharId: string;
  let warlockCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { name: 'Spells Test' },
        })
        .then((r) => r.json())
    ).id;

    // Wizard L1 con INT 15 (mod 2) → prep limit = 3.
    wizardCharId = await setupChar('Wizardo', 'wizard', { int: 15 });
    // Cleric L1 con WIS 15 (mod 2) → prep limit = 3.
    clericCharId = await setupChar('Clericen', 'cleric', { wis: 15 });
    // Sorcerer L1 con CHA 15 (mod 2) — known caster, no prep.
    sorcCharId = await setupChar('Sorceress', 'sorcerer', { cha: 15 });

    // SP01-S2: Wizard L4 with base INT 15, +2 INT ASI at L4 → INT 17 (mod +3).
    // Post-ASI prep limit = 3 + 4 = 7. PHB p.114.
    wizardL4AsiCharId = await setupWizardL4WithIntAsi();

    // SP-07: Warlock L3 (Fiend patron) for REQ-SP07-WARLOCK-PUT-SPELLS tests.
    // L3: cantrips_known=2, spells_known=4; pact slots L2×2. PHB p.107.
    // Use PATCH to set character data directly (avoids brittle level-up chain).
    {
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { campaignId, name: 'Warlock SP07' },
        })
        .then((r) => r.json());
      warlockCharId = c.id;

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/characters/${warlockCharId}`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          data: {
            classes: [
              {
                slug: 'warlock',
                source: 'PHB',
                level: 3,
                hitDie: 'd8',
                subclass: { slug: 'warlock--fiend', source: 'PHB' },
                savingThrows: ['wis', 'cha'],
                armorProficiencies: ['light'],
                weaponProficiencies: ['simple'],
                toolProficiencies: [],
                skillChoices: ['arcana', 'deception'],
              },
            ],
            baseStats: { str: 8, dex: 12, con: 13, int: 10, wis: 14, cha: 15 },
            spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
            warlockSlotsUsed: 0,
          },
        },
      });
    }

    async function setupChar(name: string, classSlug: string, scoreOverrides: Record<string, number>): Promise<string> {
      const baseScores = { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 };
      const scores = { ...baseScores, ...scoreOverrides };
      // Reorganizar a un standard array válido: [15,14,13,12,10,8]
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const standard = [15, 14, 13, 12, 10, 8];
      const finalScores: Record<string, number> = {};
      sorted.forEach(([key], i) => {
        finalScores[key] = standard[i]!;
      });

      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { campaignId, name },
        })
        .then((r) => r.json());

      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { method: 'standard-array', scores: finalScores },
      });

      // Pick skills genéricos + subclass para clases que la requieren a L1
      // (Cleric: Divine Domain, Sorcerer: Sorcerous Origin, Warlock: Otherworldly Patron).
      const skillChoicesByClass: Record<string, string[]> = {
        wizard: ['arcana', 'investigation'],
        cleric: ['insight', 'religion'],
        sorcerer: ['arcana', 'persuasion'],
      };
      const subclassByClass: Record<string, { slug: string; source: string } | null> = {
        wizard: null,
        cleric: { slug: 'cleric--life', source: 'PHB' },
        sorcerer: { slug: 'sorcerer--draconic', source: 'PHB' },
      };

      const classPayload: Record<string, unknown> = {
        class: { slug: classSlug, source: 'PHB' },
        level: 1,
        skillChoices: skillChoicesByClass[classSlug],
      };
      if (subclassByClass[classSlug]) classPayload.subclass = subclassByClass[classSlug];

      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: classPayload,
      });

      return c.id;
    }

    /**
     * SP01-S2: Wizard L4 with +2 INT ASI at L4.
     * Base INT 15 (mod +2). After ASI: INT 17 (mod +3).
     * Expected prep limit = 3 + 4 = 7. PHB p.114.
     */
    async function setupWizardL4WithIntAsi(): Promise<string> {
      const scores = { str: 10, dex: 12, con: 13, int: 15, wis: 8, cha: 14 };

      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { campaignId, name: 'Wizard L4 ASI Spells' },
        })
        .then((r) => r.json());

      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { method: 'standard-array', scores },
      });

      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${c.id}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'wizard', source: 'PHB' },
          level: 1,
          skillChoices: ['arcana', 'investigation'],
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/xp`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { award: 2700 },
      });

      // L1→L2: unlock subclass + 2 free spells.
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/classes/wizard/level-up`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          hpMethod: 'average',
          subclass: { slug: 'wizard--evocation', source: 'PHB' },
          wizardFreeSpells: [
            { slug: 'magic-missile', source: 'PHB' },
            { slug: 'shield', source: 'PHB' },
          ],
        },
      });

      // L2→L3: 2 more free spells.
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/classes/wizard/level-up`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          hpMethod: 'average',
          wizardFreeSpells: [
            { slug: 'mage-armor', source: 'PHB' },
            { slug: 'detect-magic', source: 'PHB' },
          ],
        },
      });

      // L3→L4: ASI level — +2 INT.
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/classes/wizard/level-up`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          hpMethod: 'average',
          asi: { choices: [{ ability: 'int', bonus: 2 }] },
          wizardFreeSpells: [
            { slug: 'counterspell', source: 'PHB' },
            { slug: 'fireball', source: 'PHB' },
          ],
        },
      });

      return c.id;
    }
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('Wizard: setea spellbook (known) + prepared (subset) + cantrips', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/classes/wizard/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
        ],
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
          { slug: 'mage-armor', source: 'PHB' },
          { slug: 'detect-magic', source: 'PHB' },
        ],
        prepared: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.character.data.spells.wizard.prepared).toHaveLength(2);
    expect(body.limits.wizardSpellbookSize).toBe(6);
    expect(body.limits.cantripsKnown).toBe(3);
  });

  it('Wizard: preparar más allá del INT mod + nivel → rechaza', async () => {
    const app = await getTestApp();
    // Wizard L1 INT 12 (mod 1) → prep limit = max(1, 1+1) = 2. Mando 3.
    // Pero en este setup le pusimos INT 15 mod 2 → limit 3. Mando 4.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/classes/wizard/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
          { slug: 'mage-armor', source: 'PHB' },
          { slug: 'detect-magic', source: 'PHB' },
        ],
        prepared: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
          { slug: 'mage-armor', source: 'PHB' },
          { slug: 'detect-magic', source: 'PHB' },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(
      res.json().issues.find((i: { code: string }) => i.code === 'PREPARED_LIMIT_EXCEEDED'),
    ).toBeDefined();
  });

  it('Wizard: preparar un spell que no está en el spellbook → rechaza', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/classes/wizard/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        known: [{ slug: 'shield', source: 'PHB' }],
        prepared: [{ slug: 'magic-missile', source: 'PHB' }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(
      res.json().issues.find((i: { code: string }) => i.code === 'PREPARED_NOT_IN_SPELLBOOK'),
    ).toBeDefined();
  });

  it('Cleric: prepara desde lista (sin known); preparar más de WIS+lvl → rechaza', async () => {
    const app = await getTestApp();

    // Happy path
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${clericCharId}/classes/cleric/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
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
    expect(ok.statusCode).toBe(200);

    // Cleric known no permitido
    const knownFail = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${clericCharId}/classes/cleric/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { known: [{ slug: 'cure-wounds', source: 'PHB' }] },
    });
    expect(knownFail.statusCode).toBe(400);
    expect(
      knownFail.json().issues.find((i: { code: string }) => i.code === 'KNOWN_NOT_ALLOWED'),
    ).toBeDefined();
  });

  it('Sorcerer: known fijo; mandar `prepared` → rechaza', async () => {
    const app = await getTestApp();

    const ok = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${sorcCharId}/classes/sorcerer/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
          { slug: 'prestidigitation', source: 'PHB' },
        ],
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
        ],
      },
    });
    expect(ok.statusCode).toBe(200);

    const preparedFail = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${sorcCharId}/classes/sorcerer/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { prepared: [{ slug: 'shield', source: 'PHB' }] },
    });
    expect(preparedFail.statusCode).toBe(400);
    expect(
      preparedFail.json().issues.find((i: { code: string }) => i.code === 'PREPARED_NOT_ALLOWED'),
    ).toBeDefined();
  });

  it('rechaza spell que no está en la lista de la clase', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/classes/wizard/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { known: [{ slug: 'cure-wounds', source: 'PHB' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(
      res.json().issues.find((i: { code: string }) => i.code === 'SPELL_NOT_IN_CLASS_LIST'),
    ).toBeDefined();
  });

  it('rechaza con 400 si la clase no está en el personaje', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/classes/druid/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { cantrips: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('CLASS_NOT_ON_CHARACTER');
  });

  // -- Wizard spellbook automation + copy ---------------------------------
  it('Al hacer Wizard la clase, el spellbook aparece en el inventario', async () => {
    const app = await getTestApp();
    const c = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(c.statusCode).toBe(200);
    const inv = c.json().inventory;
    const spellbook = inv.find(
      (it: { itemSlug: string; itemSource: string }) =>
        it.itemSlug === 'spellbook' && it.itemSource === 'PHB',
    );
    expect(spellbook).toBeDefined();
    expect(spellbook.quantity).toBe(1);
  });

  it('POST /spellbook/copy: cuesta 50 × nivel gp y agrega al known', async () => {
    const app = await getTestApp();

    // Dar gold suficiente: 50 gp para spell level 1, o 150 para level 3, etc.
    // Usamos un nivel 1 (mage-armor). DM (que también es el owner del char)
    // se otorga vía PATCH currency.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${wizardCharId}/currency`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { gp: 200 },
    });

    // Primero limpiamos el spellbook con un PUT vacío. Para eso reseteamos a
    // un known más chico.
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardCharId}/classes/wizard/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        cantrips: [{ slug: 'fire-bolt', source: 'PHB' }],
        known: [],
        prepared: [],
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spellbook/copy`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { spell: { slug: 'mage-armor', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.cost.gp).toBe(50);
    expect(body.cost.hours).toBe(2);
    expect(body.character.data.spells.wizard.known).toContainEqual({
      slug: 'mage-armor',
      source: 'PHB',
    });
    // gp inicial 200 (recién seteado) - 50 = 150
    expect(body.character.data.currency.gp).toBeGreaterThanOrEqual(0);
  });

  it('POST /spellbook/copy rechaza si no hay gold suficiente', async () => {
    const app = await getTestApp();

    // Crear un wizard nuevo (sin gold) para esta prueba.
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: 'Poor Wiz' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { method: 'standard-array', scores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
    });

    // Intentar copiar fireball (level 3) sin gold.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/spellbook/copy`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { spell: { slug: 'fireball', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('INSUFFICIENT_GOLD');
    expect(res.json().issues[0].costGp).toBe(150);
  });

  it('POST /spellbook/copy rechaza cantrips', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${wizardCharId}/spellbook/copy`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { spell: { slug: 'fire-bolt', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('CANTRIP_NOT_COPYABLE');
  });

  it('POST /spellbook/copy rechaza si no es Wizard', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${clericCharId}/spellbook/copy`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { spell: { slug: 'fireball', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('NO_WIZARD_CLASS');
  });

  // SP-07: REQ-SP07-WARLOCK-PUT-SPELLS — Warlock known spell selection ------

  it('SP-07 REQ-SP07-WARLOCK-PUT-SPELLS: Warlock L3 PUT happy path → 200 + DB persisted (PHB p.107)', async () => {
    // PHB p.107: Warlock L3 cantrips_known=2, spells_known=4; pact caster (no prepared)
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${warlockCharId}/classes/warlock/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        cantrips: [
          { slug: 'eldritch-blast', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
        ],
        known: [
          { slug: 'hex', source: 'PHB' },
          { slug: 'armor-of-agathys', source: 'PHB' },
          { slug: 'hellish-rebuke', source: 'PHB' },
          { slug: 'witch-bolt', source: 'PHB' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Warlock picks are stored under data.spells.warlock
    expect(body.character.data.spells.warlock.cantrips).toHaveLength(2);
    expect(body.character.data.spells.warlock.known).toHaveLength(4);
  });

  it('SP-07 REQ-SP07-WARLOCK-PUT-INVALID: Warlock L1 with 3 cantrips (limit=2) → 400 VALIDATION_FAILED (PHB p.107)', async () => {
    // PHB p.107: Warlock L3 cantrips_known=2; submitting 3 must fail
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${warlockCharId}/classes/warlock/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        cantrips: [
          { slug: 'eldritch-blast', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
          { slug: 'prestidigitation', source: 'PHB' }, // 3rd cantrip — over limit
        ],
        known: [
          { slug: 'hex', source: 'PHB' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues).toBeDefined();
    expect(
      body.issues.find((i: { code: string }) => i.code === 'CANTRIPS_KNOWN_EXCEEDED'),
    ).toBeDefined();
  });

  // SP01-S2 (REQ-SP01-PREP-LIMIT): PUT /spells MUST use post-ASI prep limit.
  // Wizard L4, base INT 15, +2 INT ASI → INT 17 (mod +3), prep limit = 7.
  // PHB p.114: "equal to your Intelligence modifier + your wizard level".
  it('SP01-S2: Wizard L4 with +2 INT ASI → PUT /spells accepts 7 prepared (post-ASI limit)', async () => {
    const app = await getTestApp();

    // Wizard L4 max spell level = 2 (full caster: L3 → max 2). PHB Wizard table.
    // Spells in spellbook (known): all must be ≤ L2 to be preparable.
    // We use L1 and L2 wizard spells only. counterspell/fireball (L3) stay in the
    // known list but cannot be in prepared (SPELL_LEVEL_TOO_HIGH).
    // Need at least 8 L1/L2 spells in the known list to prepare 7 + test 8.
    const knownSpells = [
      { slug: 'magic-missile', source: 'PHB' },   // L1
      { slug: 'shield', source: 'PHB' },            // L1
      { slug: 'mage-armor', source: 'PHB' },        // L1
      { slug: 'detect-magic', source: 'PHB' },      // L1
      { slug: 'identify', source: 'PHB' },           // L1
      { slug: 'sleep', source: 'PHB' },              // L1
      { slug: 'misty-step', source: 'PHB' },         // L2
      { slug: 'mirror-image', source: 'PHB' },       // L2
      { slug: 'web', source: 'PHB' },                // L2
    ];

    // Prepared list of 7 — all ≤ L2, all in knownSpells above.
    const sevenPrepared = [
      { slug: 'magic-missile', source: 'PHB' },
      { slug: 'shield', source: 'PHB' },
      { slug: 'mage-armor', source: 'PHB' },
      { slug: 'detect-magic', source: 'PHB' },
      { slug: 'identify', source: 'PHB' },
      { slug: 'sleep', source: 'PHB' },
      { slug: 'misty-step', source: 'PHB' },
    ];

    // First set the spellbook (known), then prepare 7 — should succeed with post-ASI limit.
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardL4AsiCharId}/classes/wizard/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
          { slug: 'prestidigitation', source: 'PHB' },
        ],
        known: knownSpells,
        prepared: sevenPrepared,
      },
    });
    // Without the fix: limit = 6 (drops levelUpAsis), 7 prepared → 400 PREPARED_LIMIT_EXCEEDED.
    // With the fix: limit = 7, 7 prepared → 200.
    expect(ok.statusCode).toBe(200);

    // 8 prepared → must still reject even after the fix (8 > 7).
    const tooMany = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${wizardL4AsiCharId}/classes/wizard/spells`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        known: knownSpells,
        prepared: [
          ...sevenPrepared,
          { slug: 'mirror-image', source: 'PHB' },  // +1 → 8 total
        ],
      },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(
      tooMany.json().issues.find((i: { code: string }) => i.code === 'PREPARED_LIMIT_EXCEEDED'),
    ).toBeDefined();
  });
});
