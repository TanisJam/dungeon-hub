import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * GET /characters/:id/classes/:classSlug/spells/options
 * Devuelve los límites de selección de spells + lista disponible + subclase grants.
 */
describe('GET /characters/:id/classes/:classSlug/spells/options', () => {
  let user: TestUser;
  let otherUser: TestUser;
  let campaignId: string;
  let fighterCharId: string;
  let wizardCharId: string;
  let clericSubclassCharId: string;
  // Subclass discovered at runtime from the compendium
  let discoveredClericSubclassSlug: string | null = null;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    otherUser = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${user.accessToken}` },
          payload: { name: 'Spells Options Test' },
        })
        .then((r) => r.json())
    ).id;

    fighterCharId = await setupChar('Fighter PHB', 'fighter', {}, null, ['athletics', 'perception']);
    wizardCharId = await setupChar('Wizard PHB', 'wizard', { int: 15 }, null, [
      'arcana',
      'investigation',
    ]);

    // Discover a cleric subclass from the compendium that grants bonus spells
    // (i.e. one that would have subclassGrants data in the DB).
    const subclassRes = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/subclasses?class=cleric&campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    const subclasses: Array<{ slug: string; source: string }> = subclassRes.json().data ?? [];
    // Prefer 'light' domain as it has bonus spells from other class lists (fireball, etc.)
    const lightDomain =
      subclasses.find((s) => s.slug.includes('light')) ??
      subclasses.find((s) => s.slug.includes('life')) ??
      subclasses[0] ??
      null;

    if (lightDomain) {
      discoveredClericSubclassSlug = lightDomain.slug;
      clericSubclassCharId = await setupChar(
        'Cleric Subclass',
        'cleric',
        { wis: 15 },
        { slug: lightDomain.slug, source: lightDomain.source },
        ['insight', 'religion'],
      );
    } else {
      // Fallback: cleric without subclass (shouldn't happen with seeded DB)
      clericSubclassCharId = await setupChar(
        'Cleric Base',
        'cleric',
        { wis: 15 },
        null,
        ['insight', 'religion'],
      );
    }

    async function setupChar(
      name: string,
      classSlug: string,
      scoreOverrides: Record<string, number>,
      subclass: { slug: string; source: string } | null,
      skillChoices: string[],
    ): Promise<string> {
      const baseScores = { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 };
      const scores = { ...baseScores, ...scoreOverrides };
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

      const classPayload: Record<string, unknown> = {
        class: { slug: classSlug, source: 'PHB' },
        level: 1,
        skillChoices,
      };
      if (subclass) classPayload.subclass = subclass;

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
    if (otherUser) await deleteTestUser(otherUser.id);
    await closeTestApp();
  });

  it('non-caster (Fighter) → limits all zero, empty lists', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${fighterCharId}/classes/fighter/spells/options`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limits.ability).toBeNull();
    expect(body.limits.cantripsKnown).toBe(0);
    expect(body.limits.maxSpellLevel).toBe(0);
    expect(body.availableSpells).toEqual([]);
    expect(body.subclassGrantedSlugs).toEqual([]);
  });

  it('Wizard L1 → limits.cantripsKnown === 3 + wizardSpellbookSize === 6, spells non-empty', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}/classes/wizard/spells/options`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limits.cantripsKnown).toBe(3);
    expect(body.limits.wizardSpellbookSize).toBe(6);
    expect(body.limits.ability).toBe('int');
    expect(body.limits.maxSpellLevel).toBeGreaterThan(0);
    expect(body.availableSpells.length).toBeGreaterThan(0);
    expect(body.subclassGrantedSlugs).toEqual([]);
    // Each spell has required fields
    const spell = body.availableSpells[0];
    expect(spell).toHaveProperty('slug');
    expect(spell).toHaveProperty('source');
    expect(spell).toHaveProperty('name');
    expect(spell).toHaveProperty('level');
    expect(spell).toHaveProperty('school');
  });

  it('Cleric with subclass → correct shape and subclassGrantedSlugs always a subset of availableSpells', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${clericSubclassCharId}/classes/cleric/spells/options`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Core assertions: response has correct shape
    expect(body.limits.ability).toBe('wis');
    expect(body.limits.cantripsKnown).toBeGreaterThan(0);
    expect(body.availableSpells.length).toBeGreaterThan(0);
    // subclassGrantedSlugs is always an array
    expect(Array.isArray(body.subclassGrantedSlugs)).toBe(true);
    // Every granted slug must be present in availableSpells (structural integrity)
    const availableSlugs = new Set(body.availableSpells.map((s: { slug: string }) => s.slug));
    for (const slug of body.subclassGrantedSlugs) {
      expect(availableSlugs.has(slug)).toBe(true);
    }
  });

  it('unknown classSlug (not on character) → 400 CLASS_NOT_ON_CHARACTER', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}/classes/druid/spells/options`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('CLASS_NOT_ON_CHARACTER');
  });

  it('non-owner → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${wizardCharId}/classes/wizard/spells/options`,
      headers: { authorization: `Bearer ${otherUser.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
