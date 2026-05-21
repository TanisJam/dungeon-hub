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
});
