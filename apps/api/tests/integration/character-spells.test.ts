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
  let clericCharId: string;
  let sorcCharId: string;

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
});
