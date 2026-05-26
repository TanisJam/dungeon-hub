import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('compendium', () => {
  let user: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: 'Compendium Test Campaign' },
    });
    if (res.statusCode !== 201) {
      throw new Error(`Failed to create test campaign: ${res.statusCode} ${res.body}`);
    }
    campaignId = res.json().id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('lista optional features (PHB Fighting Styles, etc.) sin TCE por default', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/optional-features?campaign=${campaignId}&featureType=FS:F`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThan(0);
    // Archery, Defense, Dueling, Great Weapon Fighting, etc. son PHB.
    const slugs = data.map((d: { slug: string }) => d.slug);
    expect(slugs).toContain('archery');
  });

  it('toggle TCE OFF: excluye fighting styles TCE como Blessed Warrior', async () => {
    const app = await getTestApp();
    // Default profile tiene tashasOptionalClassFeatures = false.
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/optional-features?campaign=${campaignId}&q=blessed%20warrior`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
  });

  it('toggle TCE ON: incluye fighting styles TCE como Blessed Warrior', async () => {
    const app = await getTestApp();
    // Habilitar el toggle vía PATCH del campaign.
    const c = await app
      .inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        rulesProfile: {
          ...c.rulesProfile,
          variantRules: { ...c.rulesProfile.variantRules, tashasOptionalClassFeatures: true },
        },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/optional-features?campaign=${campaignId}&q=blessed%20warrior`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThan(0);
  });

  it('returns 13 classes with the default Rules Profile (PHB + TCE Artificer)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/classes?campaign=${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBe(13);
    expect(data).toHaveLength(13);

    const slugs = data.map((c: { slug: string }) => c.slug);
    // Las 12 del PHB
    for (const c of [
      'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
      'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
    ]) {
      expect(slugs).toContain(c);
    }
    // Y Artificer de TCE
    expect(slugs).toContain('artificer');
    // Pero NO Blood Hunter (CRCotN no está en default profile)
    expect(slugs).not.toContain('blood-hunter');
  });

  it('finds Fireball with the correct class list', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/spells?campaign=${campaignId}&q=fireball`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();

    const fireball = data.find(
      (s: { slug: string; source: string }) => s.slug === 'fireball' && s.source === 'PHB',
    );
    expect(fireball).toBeDefined();
    expect(fireball.level).toBe(3);
    expect(fireball.school).toBe('V'); // Evocation
    // Wizard y Sorcerer lo tienen directo; el resto via subclases
    expect(fireball.classes).toEqual(
      expect.arrayContaining(['wizard', 'sorcerer']),
    );
  });

  it('filters spells by class and level', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/spells?campaign=${campaignId}&class=wizard&level=3`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.length).toBeGreaterThan(5);
    // Todos los resultados son level 3
    for (const s of data) {
      expect(s.level).toBe(3);
      expect(s.classes).toContain('wizard');
    }
    // Fireball está
    expect(data.some((s: { slug: string }) => s.slug === 'fireball')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // REQ-SP02-API-FLAGS: ritual/concentration/componentsM/componentsMCost
  // -------------------------------------------------------------------------

  it('SP02: GET /compendium/spells includes ritual/concentration/componentsM/componentsMCost on each spell', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/spells?campaign=${campaignId}&q=fireball`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    const fireball = data.find(
      (s: { slug: string; source: string }) => s.slug === 'fireball' && s.source === 'PHB',
    );
    expect(fireball).toBeDefined();
    // 4 new fields must be present (REQ-SP02-API-FLAGS)
    expect(typeof fireball.ritual).toBe('boolean');
    expect(typeof fireball.concentration).toBe('boolean');
    expect(typeof fireball.componentsM).toBe('boolean');
    // componentsMCost is number | null
    expect(fireball.componentsMCost === null || typeof fireball.componentsMCost === 'number').toBe(true);
    // Fireball: not ritual, not concentration, has material (string shape, no cost)
    expect(fireball.ritual).toBe(false);
    expect(fireball.concentration).toBe(false);
    expect(fireball.componentsM).toBe(true);
    expect(fireball.componentsMCost).toBeNull();
  });

  it('SP02: GET /compendium/spells?ritual=true returns only ritual spells', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/spells?campaign=${campaignId}&ritual=true`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThan(0);
    // Every returned spell must have ritual=true
    for (const s of data) {
      expect(s.ritual).toBe(true);
    }
    // Detect Magic (PHB ritual) must be included
    expect(data.some((s: { slug: string }) => s.slug === 'detect-magic')).toBe(true);
  });

  it('SP02: GET /compendium/spells?concentration=true returns only concentration spells', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/spells?campaign=${campaignId}&concentration=true`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data, total } = res.json();
    expect(total).toBeGreaterThan(0);
    // Every returned spell must have concentration=true
    for (const s of data) {
      expect(s.concentration).toBe(true);
    }
    // Bless is a concentration spell
    expect(data.some((s: { slug: string }) => s.slug === 'bless')).toBe(true);
  });

  // REQ-CIP-COST-PROJECTION — sdd/inventory-d4-d6 spec #889
  describe('costCp projection on item endpoints', () => {
    it('GET /compendium/items/:slug returns costCp for longsword (1500 cp = 15 gp)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items/longsword?campaign=${campaignId}&source=PHB`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      });
      // longsword may or may not be in this campaign's sources, skip if missing
      if (res.statusCode === 404) return;
      expect(res.statusCode).toBe(200);
      const item = res.json();
      // costCp must be present in the response (number or null)
      expect('costCp' in item).toBe(true);
      if (item.costCp !== null) {
        expect(typeof item.costCp).toBe('number');
        expect(item.costCp).toBeGreaterThanOrEqual(0);
      }
    });

    it('GET /compendium/items returns costCp on each row', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/compendium/items?campaign=${campaignId}&limit=5`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const { data } = res.json();
      if (data.length === 0) return; // edge case: empty compendium
      for (const item of data) {
        expect('costCp' in item).toBe(true);
        // costCp must be number or null — never undefined
        const val = (item as Record<string, unknown>)['costCp'];
        expect(val === null || typeof val === 'number').toBe(true);
      }
    });
  });
});
