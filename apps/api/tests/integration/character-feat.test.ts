import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Setup: personaje Wizard 1 con buena INT.
 * - tiene spellcasting → War Caster debería pasar
 * - NO tiene heavy armor → Heavy Armor Master debería fallar
 */
describe('POST /characters/:id/feats', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Feat Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId: campaign.worldId, name: 'Feat Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;

    // STR 14, INT 15 (mismo set point-buy 27)
    const sRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'point-buy',
        scores: { str: 14, dex: 13, con: 12, int: 15, wis: 10, cha: 8 },
      },
    });
    if (sRes.statusCode !== 200) throw new Error(`stats setup: ${sRes.body}`);

    const cRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
    });
    if (cRes.statusCode !== 200) throw new Error(`class setup: ${cRes.body}`);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('acepta War Caster (Wizard tiene spellcasting)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/feats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { feat: { slug: 'war-caster', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.data.feats).toHaveLength(1);
    expect(c.data.feats[0].slug).toBe('war-caster');
  });

  it('rechaza Heavy Armor Master (Wizard NO tiene heavy armor)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/feats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { feat: { slug: 'heavy-armor-master', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('PREREQ_PROFICIENCY_NOT_MET');
  });

  it('acepta Grappler con STR 14 y aplica +0 (no tiene ability grant)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/feats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { feat: { slug: 'grappler', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(201);
    const grappler = res.json().data.feats.find((f: { slug: string }) => f.slug === 'grappler');
    expect(grappler).toBeDefined();
    expect(grappler.asisApplied).toEqual([]);
  });

  it('rechaza tomar Grappler dos veces (FEAT_ALREADY_TAKEN)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/feats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { feat: { slug: 'grappler', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('FEAT_ALREADY_TAKEN');
  });

  it('Athlete: rechaza si no se provee asiChoice', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/feats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { feat: { slug: 'athlete', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('FEAT_ASI_REQUIRED');
  });

  it('Athlete: acepta con asiChoice +1 DEX y aplica el ASI', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/feats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        feat: { slug: 'athlete', source: 'PHB' },
        asiChoice: [{ ability: 'dex', bonus: 1 }],
      },
    });

    expect(res.statusCode).toBe(201);
    const athlete = res.json().data.feats.find((f: { slug: string }) => f.slug === 'athlete');
    expect(athlete.asisApplied).toEqual([{ ability: 'dex', bonus: 1 }]);
  });

  it('CL08-S2: feat ASI (Athlete +1 DEX) se incluye en el cómputo de la sheet (PHB Ch.5)', async () => {
    // PHB Ch.5 — Feats (half-feats) grant +1 to an ability score.
    // REQ-CL08-FEAT-TAG: the ephemeral AppliedAsi built from feat.asisApplied in
    // compute.ts and build-feat-context.ts MUST carry source: 'feat'.
    // Observable proxy: after adding Athlete (+1 DEX, accepted in previous test),
    // GET /sheet must reflect the feat ASI in abilityScores.dex.score.
    // Base DEX was 13. Athlete grants +1 → effective DEX should be 14.
    // This test also guards that the compute path includes feat ASIs at all.
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const sheet = res.json().sheet;
    // Base DEX = 13 (from beforeAll setup). Athlete +1 → should be 14.
    // If feat ASIs are NOT included in computeCharacterSheet, this will fail.
    expect(sheet.abilityScores.dex.score).toBe(14);
    // No source field is exposed in the API response (source is ephemeral/internal).
    // The compute path correctness is validated here; source tag correctness is
    // validated via TypeScript (pnpm typecheck) after correcting write sites.
  });
});
