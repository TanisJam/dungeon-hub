import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * World JSON export — MVP #3.9's other half (character export already shipped
 * at GET /characters/:id/export). GM-only: getWorldAccess must return 'gm'.
 *
 * Route: GET /api/v1/worlds/:worldId/export
 * Use-case: apps/api/src/use-cases/worlds/export-world.ts (buildWorldExport).
 *
 * DM-only rows (dmNotes, visibility:'dm-only') are deliberately INCLUDED —
 * this is the DM's own backup of their own content, so nothing is stripped.
 */
describe('GET /worlds/:worldId/export — world JSON export (GM-only)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  /** Seeds one row per exported entity, each carrying DM-only content. */
  async function seedWorldContent(worldId: string, authorUserId: string): Promise<void> {
    const { db } = await import('../../src/infra/db/client.js');
    const { npcs, factions, quests, hexes, pois, journalEntries } = await import(
      '../../src/infra/db/schema.js'
    );

    await db.insert(factions).values({
      worldId,
      name: 'La Orden',
      dmNotes: 'secreto de facción',
    });
    await db.insert(npcs).values({
      worldId,
      name: 'Gundren',
      dmNotes: 'secreto npc',
    });
    await db.insert(quests).values({
      worldId,
      title: 'La mina perdida',
      dmNotes: 'secreto quest',
      visibility: 'dm-only',
      authorUserId,
    });
    const [hex] = await db
      .insert(hexes)
      .values({ worldId, q: 0, r: 0, dmNotes: 'secreto hex' })
      .returning({ id: hexes.id });
    await db.insert(pois).values({
      worldId,
      hexId: hex!.id,
      name: 'Torre Olvidada',
      dmNotes: 'secreto poi',
    });
    await db.insert(journalEntries).values({
      worldId,
      title: 'Historia secreta',
      visibility: 'dm-only',
      authorUserId,
    });
  }

  it('IT-WEXP-01: GM exporta el mundo → 200, envelope con shape esperado y contenido DM-only incluido', async () => {
    const app = await getTestApp();
    const { worldId } = await createWorldWithGm(dm.id, { name: 'Reino de Prueba' });
    await seedWorldContent(worldId, dm.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/export`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.schemaVersion).toBe(1);
    expect(typeof body.exportedAt).toBe('string');
    expect(body.world.name).toBe('Reino de Prueba');
    expect(body.world.rulesProfile).toBeDefined();
    expect(Array.isArray(body.world.npcs)).toBe(true);
    expect(Array.isArray(body.world.factions)).toBe(true);
    expect(Array.isArray(body.world.quests)).toBe(true);
    expect(Array.isArray(body.world.hexes)).toBe(true);
    expect(Array.isArray(body.world.pois)).toBe(true);
    expect(Array.isArray(body.world.journal)).toBe(true);

    // DM-only content is the DM's own backup — must come through unstripped.
    const npc = body.world.npcs.find((n: any) => n.name === 'Gundren');
    expect(npc?.dmNotes).toBe('secreto npc');

    const faction = body.world.factions.find((f: any) => f.name === 'La Orden');
    expect(faction?.dmNotes).toBe('secreto de facción');

    const quest = body.world.quests.find((q: any) => q.title === 'La mina perdida');
    expect(quest?.dmNotes).toBe('secreto quest');
    expect(quest?.visibility).toBe('dm-only');

    expect(body.world.hexes.find((h: any) => h.dmNotes === 'secreto hex')).toBeDefined();

    const poi = body.world.pois.find((p: any) => p.name === 'Torre Olvidada');
    expect(poi?.dmNotes).toBe('secreto poi');

    const journal = body.world.journal.find((j: any) => j.title === 'Historia secreta');
    expect(journal?.visibility).toBe('dm-only');
  });

  it('IT-WEXP-02: player member → 403', async () => {
    const app = await getTestApp();
    const { worldId } = await createWorldWithGm(dm.id);
    await addWorldMember(worldId, alice.id, 'player');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/export`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('IT-WEXP-03: non-member → 403', async () => {
    const app = await getTestApp();
    const { worldId } = await createWorldWithGm(dm.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/export`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('IT-WEXP-04: Content-Disposition filename derivado del nombre del mundo (shared slugify)', async () => {
    const app = await getTestApp();
    const { worldId } = await createWorldWithGm(dm.id, { name: 'Reino de Ébano!!' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/export`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="reino-de-ebano.json"');
  });

  it('IT-WEXP-05: mundo sin contenido exporta un envelope válido con arrays vacíos (no error)', async () => {
    const app = await getTestApp();
    const { worldId } = await createWorldWithGm(dm.id, { name: 'Mundo Vacío' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/export`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.world.npcs).toEqual([]);
    expect(body.world.factions).toEqual([]);
    expect(body.world.quests).toEqual([]);
    expect(body.world.hexes).toEqual([]);
    expect(body.world.pois).toEqual([]);
    expect(body.world.journal).toEqual([]);
  });

  it('IT-WEXP-06: world inexistente → 404', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/00000000-0000-0000-0000-000000000000/export`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
  });
});
