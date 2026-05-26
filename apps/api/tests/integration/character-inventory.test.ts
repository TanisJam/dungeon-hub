import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

interface SimpleItem {
  slug: string;
  source: string;
}

/**
 * Tests para inventario Fase A:
 *   - POST /characters/:id/inventory: add item + warnings.
 *   - DELETE /characters/:id/inventory/:instanceId: remove.
 *   - Hard rule: attune cap = 3.
 */
describe('inventory — POST / DELETE', () => {
  let alice: TestUser; // owner martial
  let mallory: TestUser; // owner wizard
  let bob: TestUser; // outsider
  let aliceCampaignId: string;
  let aliceWorldId: string;
  let aliceCharId: string;
  let malloryCharId: string;
  let malloryCampaignId: string;
  let malloryWorldId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();
    mallory = await createTestUser();
    bob = await createTestUser();

    // Alice: Fighter, STR 15 → carry max 225.
    const aliceCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Alice Campaign' },
      })
      .then((r) => r.json());
    aliceCampaignId = aliceCampaign.id;
    aliceWorldId = aliceCampaign.worldId;

    aliceCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { worldId: aliceWorldId, name: 'Aldric the Fighter' },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${aliceCharId}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    // Mallory: Wizard, STR 8 → carry max 120.
    const malloryCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${mallory.accessToken}` },
        payload: { name: 'Mallory Campaign' },
      })
      .then((r) => r.json());
    malloryCampaignId = malloryCampaign.id;
    malloryWorldId = malloryCampaign.worldId;

    malloryCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${mallory.accessToken}` },
          payload: { worldId: malloryWorldId, name: 'Mallory the Wizard' },
        })
        .then((r) => r.json())
    ).id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${malloryCharId}/stats`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 10, con: 12, int: 15, wis: 14, cha: 13 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${malloryCharId}/class`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
    });
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    if (mallory) await deleteTestUser(mallory.id);
    if (bob) await deleteTestUser(bob.id);
    await closeTestApp();
  });

  it('401 sin token', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory`,
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('agrega un longsword carried, persiste en inventory y devuelve instanceId', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' }, state: 'carried' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.addedInstanceId).toBeTypeOf('string');
    expect(body.warnings).toEqual([]);
    expect(body.character.inventory).toHaveLength(1);
    const added = body.character.inventory[0];
    expect(added.itemSlug).toBe('longsword');
    expect(added.itemSource).toBe('PHB');
    expect(added.quantity).toBe(1);
    expect(added.state).toBe('carried');
    expect(added.attuned).toBe(false);
  });

  it('ITEM_NOT_FOUND si el slug no existe en el compendio', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'mithril-spork-of-+5-doom', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('ITEM_NOT_FOUND');
  });

  it('attune cap: el 4to ítem attuned se rechaza con 400', async () => {
    const app = await getTestApp();

    // Necesito 3 items magic distintos para attune. Uso ring-of-protection, cloak-of-protection
    // y amulet-of-health (todos DMG). Si alguno no existe en el compendio importado,
    // el test va a fallar con ITEM_NOT_FOUND — eso indica que hay que ajustar la lista.
    const attuneCandidates: SimpleItem[] = [
      { slug: 'ring-of-protection', source: 'DMG' },
      { slug: 'cloak-of-protection', source: 'DMG' },
      { slug: 'amulet-of-health', source: 'DMG' },
    ];

    // Crear un char limpio para no chocar con el longsword previo.
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Attune Test' },
      })
      .then((r) => r.json());

    for (const item of attuneCandidates) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item, attuned: true },
      });
      expect(r.statusCode).toBe(201);
    }

    const fourth = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'bag-of-holding', source: 'DMG' }, attuned: true },
    });
    expect(fourth.statusCode).toBe(400);
    expect(fourth.json().issues[0].code).toBe('ATTUNEMENT_CAP_EXCEEDED');
  });

  it('equipar plate como wizard genera warning EQUIPPED_WITHOUT_PROFICIENCY (sin bloquear)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${malloryCharId}/inventory`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: {
        item: { slug: 'plate-armor', source: 'PHB' },
        state: 'equipped',
      },
    });

    expect(res.statusCode).toBe(201);
    const w = res.json().warnings.find(
      (x: { code: string }) => x.code === 'EQUIPPED_WITHOUT_PROFICIENCY',
    );
    expect(w).toBeDefined();
    expect(w.kind).toBe('armor');
    expect(w.itemSlug).toBe('plate-armor');
  });

  it('warning ENCUMBERED si STR×15 < peso total', async () => {
    const app = await getTestApp();
    // Mallory STR 8 → max 120. Plate Armor pesa 65 lb. Le agregamos 2 plate
    // (cada uno suma 65) en stowed → total 130 > 120.
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${mallory.accessToken}` },
        payload: { worldId: malloryWorldId, name: 'Heavy Lifter' },
      })
      .then((r) => r.json());

    // Setear STR baja
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 10, con: 12, int: 15, wis: 14, cha: 13 },
      },
    });

    // Primer plate: dentro del límite (65 < 120). No warning.
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: { item: { slug: 'plate-armor', source: 'PHB' }, state: 'stowed' },
    });
    expect(first.statusCode).toBe(201);
    expect(
      first.json().warnings.some((w: { code: string }) => w.code === 'ENCUMBERED'),
    ).toBe(false);

    // Segundo: 130 > 120 → ENCUMBERED.
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: { item: { slug: 'plate-armor', source: 'PHB' }, state: 'stowed' },
    });
    expect(second.statusCode).toBe(201);
    const enc = second.json().warnings.find((w: { code: string }) => w.code === 'ENCUMBERED');
    expect(enc).toBeDefined();
    expect(enc.weight).toBe(130);
    expect(enc.max).toBe(120);
  });

  it('outsider no puede agregar ítems', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${aliceCharId}/inventory`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { item: { slug: 'longsword', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('delete remueve la instancia por instanceId', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Delete Inventory Test' },
      })
      .then((r) => r.json());

    const added = await app
      .inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' } },
      })
      .then((r) => r.json());

    const instanceId = added.addedInstanceId;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${c.id}/inventory/${instanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().character.inventory).toHaveLength(0);
  });

  it('delete 404 si la instancia no existe', async () => {
    const app = await getTestApp();
    // UUID válido pero no presente en el inventory.
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/characters/${aliceCharId}/inventory/${fakeId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().issues[0].code).toBe('INSTANCE_NOT_FOUND');
  });

  // -- PATCH ---------------------------------------------------------------
  it('PATCH equip un longsword no genera warnings (Fighter es proficient)', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'PATCH Equip' },
      })
      .then((r) => r.json());

    // Setear stats + class para que tenga profs
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    const added = await app
      .inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'longsword', source: 'PHB' } },
      })
      .then((r) => r.json());

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/inventory/${added.addedInstanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { state: 'equipped' },
    });

    expect(patch.statusCode).toBe(200);
    const body = patch.json();
    expect(body.character.inventory[0].state).toBe('equipped');
    expect(body.warnings).toEqual([]);
  });

  it('PATCH equip armadura como wizard emite warning sin bloquear', async () => {
    const app = await getTestApp();

    // Char fresco para no interferir con equip slots de tests previos.
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${mallory.accessToken}` },
        payload: { worldId: malloryWorldId, name: 'PATCH Equip Warning' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 10, con: 12, int: 15, wis: 14, cha: 13 },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
    });

    const added = await app
      .inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${mallory.accessToken}` },
        payload: { item: { slug: 'plate-armor', source: 'PHB' }, state: 'carried' },
      })
      .then((r) => r.json());

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/inventory/${added.addedInstanceId}`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: { state: 'equipped' },
    });

    expect(patch.statusCode).toBe(200);
    const w = patch
      .json()
      .warnings.find((x: { code: string }) => x.code === 'EQUIPPED_WITHOUT_PROFICIENCY');
    expect(w).toBeDefined();
    expect(w.kind).toBe('armor');
    expect(w.instanceId).toBe(added.addedInstanceId);
  });

  it('PATCH attune al 4to ítem rechaza con ATTUNEMENT_CAP_EXCEEDED', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'PATCH Attune Cap' },
      })
      .then((r) => r.json());

    const attuneSet: SimpleItem[] = [
      { slug: 'ring-of-protection', source: 'DMG' },
      { slug: 'cloak-of-protection', source: 'DMG' },
      { slug: 'amulet-of-health', source: 'DMG' },
    ];

    for (const it of attuneSet) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: it, attuned: true },
      });
      expect(r.statusCode).toBe(201);
    }

    // 4to ítem sin attune, después patcheamos.
    const fourth = await app
      .inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { item: { slug: 'bag-of-holding', source: 'DMG' } },
      })
      .then((r) => r.json());

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/inventory/${fourth.addedInstanceId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { attuned: true },
    });

    expect(patch.statusCode).toBe(400);
    expect(patch.json().issues[0].code).toBe('ATTUNEMENT_CAP_EXCEEDED');
  });

  it('PATCH untune (true → false) siempre pasa', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'PATCH Untune' },
      })
      .then((r) => r.json());

    // 3 attuned
    const ids: string[] = [];
    for (const slug of ['ring-of-protection', 'cloak-of-protection', 'amulet-of-health']) {
      const r = await app
        .inject({
          method: 'POST',
          url: `/api/v1/characters/${c.id}/inventory`,
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { item: { slug, source: 'DMG' }, attuned: true },
        })
        .then((res) => res.json());
      ids.push(r.addedInstanceId);
    }

    // Untune el primero
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/inventory/${ids[0]}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { attuned: false },
    });
    expect(patch.statusCode).toBe(200);
    expect(
      patch.json().character.inventory.find((it: { instanceId: string }) => it.instanceId === ids[0])
        .attuned,
    ).toBe(false);
  });

  it('PATCH 404 si la instancia no existe', async () => {
    const app = await getTestApp();
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${aliceCharId}/inventory/${fakeId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { state: 'equipped' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().issues[0].code).toBe('INSTANCE_NOT_FOUND');
  });

  it('PATCH 403 si no es owner', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${aliceCharId}/inventory/${'00000000-0000-4000-8000-000000000000'}`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { state: 'equipped' },
    });
    expect(res.statusCode).toBe(403);
  });

  // -- Equip slots (Inv B #2) --------------------------------------------
  it('Equip 2da armadura → 400 BODY_ARMOR_SLOT_FULL', async () => {
    const app = await getTestApp();
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Plate Hoarder' },
      })
      .then((r) => r.json());

    // Plate equipped (Alice es Fighter, sin warning).
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'plate-armor', source: 'PHB' }, state: 'equipped' },
    });
    expect(first.statusCode).toBe(201);

    // 2da armor → bloquea.
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'chain-mail', source: 'PHB' }, state: 'equipped' },
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().issues.some((i: { code: string }) => i.code === 'BODY_ARMOR_SLOT_FULL')).toBe(true);
  });

  it('Equip 2H weapon como `main` → 400 TWO_HANDED_REQUIRES_BOTH', async () => {
    const app = await getTestApp();
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Greatsword Test' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        item: { slug: 'greatsword', source: 'PHB' },
        state: 'equipped',
        equipHand: 'main',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.some((i: { code: string }) => i.code === 'TWO_HANDED_REQUIRES_BOTH')).toBe(true);
  });

  it('Equip 2H weapon como `both` → ok', async () => {
    const app = await getTestApp();
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Greatsword Both' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        item: { slug: 'greatsword', source: 'PHB' },
        state: 'equipped',
        equipHand: 'both',
      },
    });
    expect(res.statusCode).toBe(201);
  });

  // -- Currency ------------------------------------------------------------
  it('PATCH currency: suma y resta gp sin conversión', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Money Bags' },
      })
      .then((r) => r.json());

    // Sumar 100 gp y 5 sp
    const add = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/currency`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { gp: 100, sp: 5 },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json().currency).toEqual({ cp: 0, sp: 5, ep: 0, gp: 100, pp: 0 });

    // Restar 30 gp
    const sub = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/currency`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { gp: -30 },
    });
    expect(sub.statusCode).toBe(200);
    expect(sub.json().currency.gp).toBe(70);
  });

  it('PATCH currency: INSUFFICIENT_FUNDS si una resta deja negativo', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Poor Soul' },
      })
      .then((r) => r.json());

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/currency`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { gp: -10 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('INSUFFICIENT_FUNDS');
    expect(res.json().issues[0].coin).toBe('gp');
  });

  // -- Sheet integration ---------------------------------------------------
  it('GET /sheet: refleja encumbrance, attunement y currency', async () => {
    const app = await getTestApp();

    // Mallory STR 8 → max 120. Plate (65) × 2 → 130 → over.
    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${mallory.accessToken}` },
        payload: { worldId: malloryWorldId, name: 'Sheet Integration' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 10, con: 12, int: 15, wis: 14, cha: 13 },
      },
    });

    for (let i = 0; i < 2; i++) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${c.id}/inventory`,
        headers: { authorization: `Bearer ${mallory.accessToken}` },
        payload: { item: { slug: 'plate-armor', source: 'PHB' } },
      });
    }

    // Attune 1 ítem.
    await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: { item: { slug: 'ring-of-protection', source: 'DMG' }, attuned: true },
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${c.id}/currency`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
      payload: { gp: 50 },
    });

    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${c.id}/sheet`,
      headers: { authorization: `Bearer ${mallory.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const sheet = sheetRes.json().sheet;
    // PHB p.143: 50 gp = 50 coins = 1 lb of coin weight (sdd/inventory-d4-d6).
    // 2× plate armor = 130 lb + 1 lb coins = 131 lb total.
    expect(sheet.encumbrance.weight).toBe(131);
    expect(sheet.encumbrance.coinWeight).toBe(1);
    expect(sheet.encumbrance.max).toBe(120);
    expect(sheet.encumbrance.status).toBe('over');
    expect(sheet.attunement).toEqual({ used: 1, max: 3 });
    expect(sheet.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 });
  });

  // -- Armor / AC integration (inventory-foundation C3) -------------------
  // REQ-AC-MEDIUM-ARMOR + REQ-CIP-ARMOR-FIELDS. PHB p.144.
  // Chain Shirt = medium armor (ac 13), DEX capped at +2.
  it('GET /sheet: STR 10 / DEX 14 + equipped chain shirt → AC 15', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Chain Shirt Carrier' },
      })
      .then((r) => r.json());

    // STR 10, DEX 14 (+2), rest filler. Fighter has medium armor prof.
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 10, dex: 14, con: 13, int: 12, wis: 8, cha: 15 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'chain-shirt', source: 'PHB' }, state: 'equipped' },
    });
    expect(addRes.statusCode).toBe(201);

    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${c.id}/sheet`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const sheet = sheetRes.json().sheet;
    // Chain shirt 13 + min(DEX +2, 2) = 15.
    expect(sheet.armorClass.value).toBe(15);
    // No STR warning — chain shirt has no strength minimum.
    expect(sheet.warnings ?? []).not.toContain('INSUFFICIENT_STRENGTH_FOR_ARMOR');
  });

  // REQ-AC-HEAVY-ARMOR + REQ-AC-STR-WARNING + REQ-CIP-ARMOR-FIELDS. PHB p.144.
  // Plate = heavy armor (ac 18, strength "15"). DEX ignored. STR 8 < 15 → warning.
  it('GET /sheet: STR 8 + equipped plate → AC 18 + INSUFFICIENT_STRENGTH_FOR_ARMOR warning', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Weak Plate Fighter' },
      })
      .then((r) => r.json());

    // STR 8 (below plate's strength=15), DEX 14, Fighter (heavy armor prof).
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'plate-armor', source: 'PHB' }, state: 'equipped' },
    });
    expect(addRes.statusCode).toBe(201);

    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${c.id}/sheet`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const sheet = sheetRes.json().sheet;
    // Plate AC 18, DEX ignored. STR warning is non-blocking — AC still computes.
    expect(sheet.armorClass.value).toBe(18);
    expect(sheet.warnings).toContain('INSUFFICIENT_STRENGTH_FOR_ARMOR');
  });

  // REQ-AC-SHIELD + REQ-CIP-ARMOR-FIELDS. PHB p.144 + p.149.
  // Chain shirt (13, medium, DEX cap +2) + Shield (+2) + DEX 14 → 13 + 2 + 2 = 17.
  // NOTE: standard array is [15,14,13,12,10,8] — DEX 16 needs point-buy/rolled.
  // DEX 14 already yields the +2 cap, so the assertion is the same.
  it('GET /sheet: chain shirt + shield + DEX 14 → AC 17 (medium cap + shield bonus)', async () => {
    const app = await getTestApp();

    const c = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId: aliceWorldId, name: 'Sword and Board' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/stats`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 13, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${c.id}/class`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });

    const csRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'chain-shirt', source: 'PHB' }, state: 'equipped' },
    });
    expect(csRes.statusCode).toBe(201);
    const shRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${c.id}/inventory`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { item: { slug: 'shield', source: 'PHB' }, state: 'equipped' },
    });
    expect(shRes.statusCode).toBe(201);

    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${c.id}/sheet`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const sheet = sheetRes.json().sheet;
    // 13 (chain shirt) + min(DEX +2, 2) (medium cap) + 2 (shield) = 17.
    expect(sheet.armorClass.value).toBe(17);
  });
});
