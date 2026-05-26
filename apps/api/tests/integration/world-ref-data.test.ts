/**
 * world-ref-data.test.ts — Integration tests for loadWorldRefData().
 *
 * Covers REQ-DRD-LOADER from
 * sdd/domain-reference-data-runtime-source/spec (#806).
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { loadWorldRefData } from '../../src/use-cases/world/load-ref-data.js';

describe('loadWorldRefData()', () => {
  let gm: TestUser;
  let defaultWorldId: string;
  let customWorldId: string;

  beforeAll(async () => {
    await getTestApp();
    gm = await createTestUser();

    // Default world: PHB+XGE+TCE enabled (per DEFAULT_RULES_PROFILE)
    ({ worldId: defaultWorldId } = await createWorldWithGm(gm.id, {
      name: 'Default Ref-Data World',
    }));

    // Custom world: same default profile but disabledEntities.languages = ["orc|PHB"]
    ({ worldId: customWorldId } = await createWorldWithGm(gm.id, {
      name: 'Orc-Disabled Ref-Data World',
    }));
    const { db } = await import('../../src/infra/db/client.js');
    const { worlds } = await import('../../src/infra/db/schema.js');
    const { DEFAULT_RULES_PROFILE } = await import('@dungeon-hub/domain/rules-profile');
    await db
      .update(worlds)
      .set({
        rulesProfile: {
          ...DEFAULT_RULES_PROFILE,
          disabledEntities: {
            ...DEFAULT_RULES_PROFILE.disabledEntities,
            languages: ['orc|PHB'],
          },
        },
      })
      .where(eq(worlds.id, customWorldId));
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    await closeTestApp();
  });

  it('default world returns PHB-equivalent pools (≥8 standard languages, 5 subrace keys)', async () => {
    const refData = await loadWorldRefData(defaultWorldId);
    expect(refData).not.toBeNull();
    if (!refData) return;

    // PHB has 8 standard + 8 exotic; other enabled sources may add more.
    expect(refData.languagePool.standard.length).toBeGreaterThanOrEqual(8);
    expect(refData.languagePool.standard).toContain('common');
    expect(refData.languagePool.standard).toContain('dwarvish');
    expect(refData.languagePool.exotic).toContain('draconic');

    // Subrace registry — PHB defaults (5 PHB races requiring subrace).
    expect(refData.subraceRequiredSet.size).toBeGreaterThanOrEqual(5);
    expect(refData.subraceRequiredSet.has('dwarf|PHB')).toBe(true);
    expect(refData.subraceRequiredSet.has('dragonborn|PHB')).toBe(true);
    expect(refData.subraceReplacingAbilitySet.has('human--variant|PHB')).toBe(true);
  });

  it('disabledEntities.languages: ["orc|PHB"] removes orc from languagePool', async () => {
    const refData = await loadWorldRefData(customWorldId);
    expect(refData).not.toBeNull();
    if (!refData) return;

    expect(refData.languagePool.standard).not.toContain('orc');
    // Other PHB standard languages must still be present.
    expect(refData.languagePool.standard).toContain('common');
    expect(refData.languagePool.standard).toContain('dwarvish');
  });

  it('unknown worldId returns null', async () => {
    const refData = await loadWorldRefData(randomUUID());
    expect(refData).toBeNull();
  });
});
