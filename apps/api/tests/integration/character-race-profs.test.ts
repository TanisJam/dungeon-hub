import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Batch 5 — race-weapon-armor-profs integration tests (A-1..A-4).
 * Verifies that GET /sheet projects race+subrace weapon/armor proficiencies
 * correctly after loadRaceSheetData applies Decision #589 override logic.
 *
 * Test DB has 5etools data seeded:
 *   Dwarf (race): weaponProficiencies: [{"battleaxe|phb":true,"handaxe|phb":true,"light hammer|phb":true,"warhammer|phb":true}]
 *   Hill (subrace of Dwarf): no weaponProficiencies/armorProficiencies
 *   Mountain (subrace of Dwarf): armorProficiencies: [{"light":true,"medium":true}]
 *   Elf (race): no weaponProficiencies (5etools — elf subraces carry it)
 *   Drow (subrace of Elf): weaponProficiencies: [{"rapier|phb":true,"shortsword|phb":true,"hand crossbow|phb":true}]
 *   Human (race): no weaponProficiencies
 */
describe('GET /characters/:id/sheet — race weapon/armor proficiencies (Batch 5)', () => {
  let user: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Race Profs Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  /**
   * Helper: create a fresh character, optionally set stats/race/class,
   * then return the computed sheet.
   */
  async function buildSheet(opts: {
    race: { slug: string; source: string };
    subrace?: { slug: string; source: string } | null;
    class?: { slug: string; source: string; level: number; skillChoices?: string[] };
    languageChoices?: string[];
    appliedAsis?: Array<{ ability: string; bonus: number; source: string }>;
  }) {
    const app = await getTestApp();

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: `Test ${opts.race.slug}` },
      })
      .then((r) => r.json());
    const characterId = character.id as string;

    // Set minimal stats
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });

    // Set race
    const racePayload: Record<string, unknown> = {
      race: opts.race,
      subrace: opts.subrace ?? null,
      languageChoices: opts.languageChoices ?? [],
    };
    if (opts.appliedAsis) racePayload['appliedAsis'] = opts.appliedAsis;
    const raceRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: racePayload,
    });
    if (raceRes.statusCode !== 200) {
      throw new Error(`PUT /race failed: ${raceRes.statusCode} ${raceRes.body}`);
    }

    // Set class if provided
    if (opts.class) {
      const classRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: opts.class.slug, source: opts.class.source },
          level: opts.class.level,
          skillChoices: opts.class.skillChoices ?? [],
        },
      });
      if (classRes.statusCode !== 200) {
        throw new Error(`PUT /class failed: ${classRes.statusCode} ${classRes.body}`);
      }
    }

    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    if (sheetRes.statusCode !== 200) {
      throw new Error(`GET /sheet failed: ${sheetRes.statusCode} ${sheetRes.body}`);
    }
    return sheetRes.json().sheet;
  }

  // A-1: Hill Dwarf — race weapons present, no armor from race.
  // PHB p.20 — Dwarf Weapon Training: battleaxe, handaxe, light hammer, warhammer.
  // Hill subrace has NO weaponProficiencies → race level used.
  it('A-1: GET /sheet Hill Dwarf → proficiencies.weapons includes 4 dwarf weapons (PHB p.20)', async () => {
    const sheet = await buildSheet({
      race: { slug: 'dwarf', source: 'PHB' },
      subrace: { slug: 'dwarf--hill', source: 'PHB' },
    });

    expect(sheet.proficiencies.weapons).toContain('battleaxe');
    expect(sheet.proficiencies.weapons).toContain('handaxe');
    expect(sheet.proficiencies.weapons).toContain('light hammer');
    expect(sheet.proficiencies.weapons).toContain('warhammer');
    // Hill Dwarf has no armor from race
    expect(sheet.proficiencies.armor).not.toContain('light');
    expect(sheet.proficiencies.armor).not.toContain('medium');
  });

  // A-2: Mountain Dwarf — same race weapons + light + medium armor from subrace.
  // PHB p.20 — Mountain Dwarf: light and medium armor proficiency.
  // Mountain subrace armorProficiencies OVERRIDES race (race has none → override yields addition).
  it('A-2: GET /sheet Mountain Dwarf → weapons + light+medium armor (PHB p.20)', async () => {
    const sheet = await buildSheet({
      race: { slug: 'dwarf', source: 'PHB' },
      subrace: { slug: 'dwarf--mountain', source: 'PHB' },
    });

    expect(sheet.proficiencies.weapons).toContain('battleaxe');
    expect(sheet.proficiencies.weapons).toContain('handaxe');
    expect(sheet.proficiencies.weapons).toContain('light hammer');
    expect(sheet.proficiencies.weapons).toContain('warhammer');
    expect(sheet.proficiencies.armor).toContain('light');
    expect(sheet.proficiencies.armor).toContain('medium');
  });

  // A-3: Drow Wizard — Drow REPLACES Elf weapons (Decision #589 override).
  // PHB p.24 — Drow Weapon Training: rapier, shortsword, hand crossbow ONLY.
  // STRICT NEGATIVE: longsword must NOT appear (union bug would leave it in).
  // Elf race has 1 language slot (anyStandard:1) → pass dwarvish to satisfy validation.
  it('A-3 (CRITICAL): GET /sheet Drow Wizard → rapier+shortsword+hand crossbow; NOT longsword (PHB p.24)', async () => {
    const sheet = await buildSheet({
      race: { slug: 'elf', source: 'PHB' },
      subrace: { slug: 'elf--drow', source: 'PHB' },
      class: {
        slug: 'wizard',
        source: 'PHB',
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
      // Drow subrace does not grant an extra language slot (common + elvish fixed)
      languageChoices: [],
    });

    expect(sheet.proficiencies.weapons).toContain('rapier');
    expect(sheet.proficiencies.weapons).toContain('shortsword');
    expect(sheet.proficiencies.weapons).toContain('hand crossbow');

    // STRICT NEGATIVE — union bug signature: these would appear if subrace merge is union not override
    expect(sheet.proficiencies.weapons).not.toContain('longsword');
    expect(sheet.proficiencies.weapons).not.toContain('shortbow');
    expect(sheet.proficiencies.weapons).not.toContain('longbow');
  });

  // A-4: Human Wizard — race has no weapon/armor profs. Only class profs present.
  // PHB p.31 — Human: no weapon or armor training from race.
  // Human grants 1 language choice (anyStandard: 1 in PHB data).
  it('A-4: GET /sheet Human Wizard → only class weapon profs, no race contribution (PHB p.31)', async () => {
    const sheet = await buildSheet({
      race: { slug: 'human', source: 'PHB' },
      class: {
        slug: 'wizard',
        source: 'PHB',
        level: 1,
        skillChoices: ['arcana', 'investigation'],
      },
      languageChoices: ['dwarvish'],
      // Human in 5etools PHB has ability:null → MPMM-style, requires explicit ASI distribution
      appliedAsis: [
        { ability: 'str', bonus: 2, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
      ],
    });

    // Wizard class weapons present (exact slug from compendium DB, plural form)
    expect(sheet.proficiencies.weapons.length).toBeGreaterThan(0);
    // Race contributes nothing — no battleaxe/longsword/etc. from race
    expect(sheet.proficiencies.weapons).not.toContain('battleaxe');
    expect(sheet.proficiencies.weapons).not.toContain('longsword');
    // No armor from race either
    expect(sheet.proficiencies.armor).not.toContain('light');
    expect(sheet.proficiencies.armor).not.toContain('medium');
  });
});
