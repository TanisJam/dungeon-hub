/**
 * Smoke tests for the seed pack (PHB / XGE / TCE).
 *
 * Runs `parseAll(DATA_DIR)` once and asserts:
 *   - Row counts per (entity, source) meet a documented `≥` floor.
 *     Floors were captured from the importer output on 2026-05-26 and serve
 *     as regression gates: a drop means upstream data changed or an importer
 *     regression happened.
 *   - Canonical entities are present per source (Wizard PHB has 8 subclasses,
 *     Fireball PHB at level 3, Artificer TCE exists, etc.).
 *
 * Source codes used here are the 5etools codes as they appear on disk:
 *   PHB  — Player's Handbook (2014)
 *   XGE  — Xanathar's Guide to Everything (2017)
 *   TCE  — Tasha's Cauldron of Everything (2020)
 *
 * Skip-on-absent: the whole suite skips cleanly when `data/5etools/data/`
 * is not on disk (e.g. CI without the dataset).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseAll } from './index.js';
import type {
  ImportResult,
  NormalizedRace,
  NormalizedRecord,
  NormalizedSpell,
  NormalizedSubclass,
} from './types.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_DIR = join(REPO_ROOT, 'data/5etools/data');

describe.skipIf(!existsSync(DATA_DIR))('seed-pack smoke — PHB/XGE/TCE', () => {
  let result: ImportResult;

  beforeAll(async () => {
    result = await parseAll(DATA_DIR);
  }, 120_000);

  function bySource<T extends NormalizedRecord>(arr: T[], source: string): T[] {
    return arr.filter((r) => r.source === source);
  }

  // -----------------------------------------------------------------------
  // PHB — baseline. Counts captured 2026-05-26 from data/5etools/data.
  // -----------------------------------------------------------------------
  describe('PHB (Player\'s Handbook 2014)', () => {
    it('row counts meet documented floors', () => {
      expect(bySource(result.races, 'PHB').length).toBeGreaterThanOrEqual(29);
      expect(bySource(result.classes, 'PHB').length).toBeGreaterThanOrEqual(12);
      expect(bySource(result.subclasses, 'PHB').length).toBeGreaterThanOrEqual(40);
      expect(bySource(result.backgrounds, 'PHB').length).toBeGreaterThanOrEqual(20);
      expect(bySource(result.spells, 'PHB').length).toBeGreaterThanOrEqual(361);
      expect(bySource(result.items, 'PHB').length).toBeGreaterThanOrEqual(265);
      expect(bySource(result.feats, 'PHB').length).toBeGreaterThanOrEqual(42);
      expect(bySource(result.optionalFeatures, 'PHB').length).toBeGreaterThanOrEqual(82);
      expect(bySource(result.languages, 'PHB').length).toBeGreaterThanOrEqual(18);
      expect(bySource(result.actions, 'PHB').length).toBeGreaterThanOrEqual(20);
      expect(bySource(result.conditions, 'PHB').length).toBeGreaterThanOrEqual(17);
    });

    it('Wizard class exists with 8 PHB Schools of Magic subclasses', () => {
      const wizard = result.classes.find(
        (c) => c.slug === 'wizard' && c.source === 'PHB',
      );
      expect(wizard).toBeDefined();

      const wizardSubs = result.subclasses.filter(
        (s: NormalizedSubclass) =>
          s.classSlug === 'wizard' && s.classSource === 'PHB' && s.source === 'PHB',
      );
      expect(wizardSubs).toHaveLength(8);

      const expectedSchools = [
        'wizard--abjuration',
        'wizard--conjuration',
        'wizard--divination',
        'wizard--enchantment',
        'wizard--evocation',
        'wizard--illusion',
        'wizard--necromancy',
        'wizard--transmutation',
      ];
      const actualSlugs = wizardSubs.map((s) => s.slug).sort();
      expect(actualSlugs).toEqual(expectedSchools);
    });

    it('Fireball spell exists at level 3 on wizard + sorcerer list (PHB p.241)', () => {
      const fireball: NormalizedSpell | undefined = result.spells.find(
        (s) => s.slug === 'fireball' && s.source === 'PHB',
      );
      expect(fireball).toBeDefined();
      expect(fireball!.level).toBe(3);
      expect(fireball!.classes).toEqual(expect.arrayContaining(['wizard', 'sorcerer']));
    });

    it('Aasimar is NOT a PHB race (lives in VGM/MPMM)', () => {
      const aasimarPhb: NormalizedRace | undefined = result.races.find(
        (r) => r.slug === 'aasimar' && r.source === 'PHB',
      );
      expect(aasimarPhb).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // XGE — Xanathar's Guide to Everything (2017).
  // -----------------------------------------------------------------------
  describe('XGE (Xanathar\'s Guide to Everything 2017)', () => {
    it('row counts meet documented floors', () => {
      expect(bySource(result.subclasses, 'XGE').length).toBeGreaterThanOrEqual(31);
      expect(bySource(result.spells, 'XGE').length).toBeGreaterThanOrEqual(95);
      expect(bySource(result.items, 'XGE').length).toBeGreaterThanOrEqual(43);
      expect(bySource(result.feats, 'XGE').length).toBeGreaterThanOrEqual(15);
      expect(bySource(result.optionalFeatures, 'XGE').length).toBeGreaterThanOrEqual(22);
      expect(bySource(result.actions, 'XGE').length).toBeGreaterThanOrEqual(2);
    });

    it('adds Bard College of Glamour (XGE source, classSource=PHB)', () => {
      const glamour = result.subclasses.find(
        (s) => s.slug === 'bard--glamour' && s.source === 'XGE',
      );
      expect(glamour).toBeDefined();
      expect(glamour!.classSlug).toBe('bard');
      expect(glamour!.classSource).toBe('PHB');
    });

    it('adds Wizard War Magic subclass', () => {
      const war = result.subclasses.find(
        (s) => s.slug === 'wizard--war' && s.source === 'XGE',
      );
      expect(war).toBeDefined();
      expect(war!.classSlug).toBe('wizard');
      expect(war!.classSource).toBe('PHB');
    });

    it('adds canonical XGE spells (e.g. Abi-Dalzim\'s Horrid Wilting)', () => {
      const horridWilting = result.spells.find(
        (s) => s.slug === 'abi-dalzims-horrid-wilting' && s.source === 'XGE',
      );
      expect(horridWilting).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // TCE — Tasha's Cauldron of Everything (2020).
  // -----------------------------------------------------------------------
  describe('TCE (Tasha\'s Cauldron of Everything 2020)', () => {
    it('row counts meet documented floors', () => {
      expect(bySource(result.classes, 'TCE').length).toBeGreaterThanOrEqual(1);
      expect(bySource(result.subclasses, 'TCE').length).toBeGreaterThanOrEqual(30);
      expect(bySource(result.spells, 'TCE').length).toBeGreaterThanOrEqual(21);
      expect(bySource(result.items, 'TCE').length).toBeGreaterThanOrEqual(86);
      expect(bySource(result.feats, 'TCE').length).toBeGreaterThanOrEqual(15);
      expect(bySource(result.optionalFeatures, 'TCE').length).toBeGreaterThanOrEqual(47);
    });

    it('Artificer class exists with 4 base TCE subclasses', () => {
      const artificer = result.classes.find(
        (c) => c.slug === 'artificer' && c.source === 'TCE',
      );
      expect(artificer).toBeDefined();

      const artificerSubs = result.subclasses.filter(
        (s) =>
          s.classSlug === 'artificer' && s.classSource === 'TCE' && s.source === 'TCE',
      );
      expect(artificerSubs).toHaveLength(4);

      const expectedSubs = [
        'artificer--alchemist',
        'artificer--armorer',
        'artificer--artillerist',
        'artificer--battle-smith',
      ];
      const actualSlugs = artificerSubs.map((s) => s.slug).sort();
      expect(actualSlugs).toEqual(expectedSubs);
    });

    it('adds canonical TCE spell (Blade of Disaster)', () => {
      const blade = result.spells.find(
        (s) => s.slug === 'blade-of-disaster' && s.source === 'TCE',
      );
      expect(blade).toBeDefined();
    });

    it('adds canonical TCE optional feature (Ambush — Rogue Cunning Strike)', () => {
      const ambush = result.optionalFeatures.find(
        (o) => o.slug === 'ambush' && o.source === 'TCE',
      );
      expect(ambush).toBeDefined();
    });
  });
});
