import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * XP awarding — solo el DM de la campaña puede otorgar/restar XP.
 * El owner del personaje NO puede modificar su propio XP.
 */
describe('POST /characters/:id/xp', () => {
  let dm: TestUser; // GM de la campaña
  let player: TestUser; // dueño del personaje, member de la campaña
  let outsider: TestUser; // user sin relación con la campaña
  let campaignId: string;
  let worldId: string;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    // El DM crea la campaña (queda como gmUserId + miembro con rol gm).
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'XP Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId; // C5: POST /campaigns now returns worldId

    // El player se une a la campaña.
    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaignId, player.id, 'player');

    // El player crea su personaje.
    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${player.accessToken}` },
        payload: { worldId, name: 'XP Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('401 sin token', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/xp`,
      payload: { award: 500 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('DM otorga XP correctamente', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 500 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().xp).toBe(500);
    expect(res.json().award).toBe(500);
    expect(res.json().character.xp).toBe(500);
  });

  it('owner del personaje NO puede otorgar XP (solo el DM)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/xp`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { award: 1000 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('outsider (no es miembro) recibe 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/xp`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { award: 100 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('award negativo (penalty / correction) baja el XP', async () => {
    const app = await getTestApp();
    // Estado: 500 después del primer it. Restamos 200.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: -200 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().xp).toBe(300);
  });

  it('award que deja XP negativo → 400 XP_NEGATIVE', async () => {
    const app = await getTestApp();
    // Estado actual: 300. Intentamos restar 1000.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/xp`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: -1000 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('XP_NEGATIVE');
    expect(res.json().issues[0].current).toBe(300);
    expect(res.json().issues[0].award).toBe(-1000);
    expect(res.json().issues[0].result).toBe(-700);
  });

  it('404 si el personaje no existe', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/00000000-0000-4000-8000-000000000000/xp',
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { award: 100 },
    });
    expect(res.statusCode).toBe(404);
  });
});
