/**
 * Tests for PHB 2014 p.34 Draconic Ancestry table synthesizer.
 * Source: PHB p.34 — Draconic Ancestry table.
 */
import { describe, expect, it } from 'vitest';
import {
  PHB_DRAGONBORN_ANCESTRIES,
  expandDragonbornAncestries,
} from './phb-dragonborn-ancestries.js';
import type { NormalizedRace } from '../types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeBaseRow(slug: string, source: string): NormalizedRace {
  return {
    slug,
    source,
    name: slug,
    data: { speed: 30, size: ['M'] },
    reprintedAs: null,
    isSubrace: false,
    parentSlug: null,
    parentSource: null,
  };
}

const PHB_DRAGONBORN_BASE = makeBaseRow('dragonborn', 'PHB');

// ── I-1..I-10: One test per ancestry color ────────────────────────────────────

describe('expandDragonbornAncestries — individual ancestry rows (PHB p.34)', () => {
  const rows = expandDragonbornAncestries(PHB_DRAGONBORN_BASE);

  it('I-1 (S-05): emits exactly 10 subrace rows', () => {
    expect(rows).toHaveLength(10);
  });

  it('I-2 (S-08): all rows have source=PHB, parentSlug=dragonborn, isSubrace=true', () => {
    for (const row of rows) {
      expect(row.source).toBe('PHB');
      expect(row.parentSlug).toBe('dragonborn');
      expect(row.parentSource).toBe('PHB');
      expect(row.isSubrace).toBe(true);
    }
  });

  it('I-3 (S-05): slug set matches exactly the 10 expected dragonborn--<color> slugs', () => {
    const slugs = rows.map((r) => r.slug).sort();
    expect(slugs).toEqual([
      'dragonborn--black',
      'dragonborn--blue',
      'dragonborn--brass',
      'dragonborn--bronze',
      'dragonborn--copper',
      'dragonborn--gold',
      'dragonborn--green',
      'dragonborn--red',
      'dragonborn--silver',
      'dragonborn--white',
    ]);
  });

  // S-02: Black — line/Dex/acid
  it('I-4 (S-06): dragonborn--black → acid / line / dex (PHB p.34)', () => {
    const row = rows.find((r) => r.slug === 'dragonborn--black')!;
    const bw = (row.data as { breathWeapon: { damageType: string; shape: string; savingThrow: string } }).breathWeapon;
    expect(bw.damageType).toBe('acid');
    expect(bw.shape).toBe('line');
    expect(bw.savingThrow).toBe('dex');
    const resist = (row.data as { resist: string[] }).resist;
    expect(resist).toContain('acid');
    expect(row.name).toBe('Black');
  });

  // Blue — line/Dex/lightning
  it('I-5: dragonborn--blue → lightning / line / dex (PHB p.34)', () => {
    const row = rows.find((r) => r.slug === 'dragonborn--blue')!;
    const bw = (row.data as { breathWeapon: { damageType: string; shape: string; savingThrow: string } }).breathWeapon;
    expect(bw.damageType).toBe('lightning');
    expect(bw.shape).toBe('line');
    expect(bw.savingThrow).toBe('dex');
  });

  // Brass — line/Dex/fire
  it('I-6: dragonborn--brass → fire / line / dex (PHB p.34)', () => {
    const row = rows.find((r) => r.slug === 'dragonborn--brass')!;
    const bw = (row.data as { breathWeapon: { damageType: string; shape: string; savingThrow: string } }).breathWeapon;
    expect(bw.damageType).toBe('fire');
    expect(bw.shape).toBe('line');
    expect(bw.savingThrow).toBe('dex');
  });

  // Gold — cone/Dex/fire (S-03)
  it('I-7 (S-03): dragonborn--gold → fire / cone / dex (PHB p.34)', () => {
    const row = rows.find((r) => r.slug === 'dragonborn--gold')!;
    const bw = (row.data as { breathWeapon: { damageType: string; shape: string; savingThrow: string } }).breathWeapon;
    expect(bw.damageType).toBe('fire');
    expect(bw.shape).toBe('cone');
    expect(bw.savingThrow).toBe('dex');
    const resist = (row.data as { resist: string[] }).resist;
    expect(resist).toContain('fire');
  });

  // Green — cone/Con/poison (S-04 — CRITICAL: NOT line/Dex)
  it('I-8 (S-04): dragonborn--green → poison / CONE / CON (PHB p.34 — not line/Dex)', () => {
    const row = rows.find((r) => r.slug === 'dragonborn--green')!;
    const bw = (row.data as { breathWeapon: { damageType: string; shape: string; savingThrow: string } }).breathWeapon;
    expect(bw.damageType).toBe('poison');
    expect(bw.shape).toBe('cone');
    expect(bw.savingThrow).toBe('con');
  });

  // Silver — cone/Con/cold (S-07)
  it('I-9 (S-07): dragonborn--silver → cold / cone / con (PHB p.34)', () => {
    const row = rows.find((r) => r.slug === 'dragonborn--silver')!;
    const bw = (row.data as { breathWeapon: { damageType: string; shape: string; savingThrow: string } }).breathWeapon;
    expect(bw.damageType).toBe('cold');
    expect(bw.shape).toBe('cone');
    expect(bw.savingThrow).toBe('con');
    const resist = (row.data as { resist: string[] }).resist;
    expect(resist).toContain('cold');
  });

  // White — cone/Con/cold
  it('I-10: dragonborn--white → cold / cone / con (PHB p.34)', () => {
    const row = rows.find((r) => r.slug === 'dragonborn--white')!;
    const bw = (row.data as { breathWeapon: { damageType: string; shape: string; savingThrow: string } }).breathWeapon;
    expect(bw.damageType).toBe('cold');
    expect(bw.shape).toBe('cone');
    expect(bw.savingThrow).toBe('con');
  });
});

// ── PHB_DRAGONBORN_ANCESTRIES constant ───────────────────────────────────────

describe('PHB_DRAGONBORN_ANCESTRIES constant', () => {
  it('I-0 (S-01): has exactly 10 entries', () => {
    expect(PHB_DRAGONBORN_ANCESTRIES).toHaveLength(10);
  });

  it('all entries have unique slugs', () => {
    const slugs = PHB_DRAGONBORN_ANCESTRIES.map((a) => `dragonborn--${a.color.toLowerCase()}`);
    expect(new Set(slugs).size).toBe(10);
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('expandDragonbornAncestries — idempotency (S-09)', () => {
  it('I-11: calling twice with same input returns deeply-equal arrays', () => {
    const rows1 = expandDragonbornAncestries(PHB_DRAGONBORN_BASE);
    const rows2 = expandDragonbornAncestries(PHB_DRAGONBORN_BASE);
    expect(rows1).toEqual(rows2);
  });
});

// ── Guard cases (S-10) ────────────────────────────────────────────────────────

describe('expandDragonbornAncestries — guard cases', () => {
  it('I-12 (S-10): non-Dragonborn base race → empty array', () => {
    const elfRow = makeBaseRow('elf', 'PHB');
    expect(expandDragonbornAncestries(elfRow)).toHaveLength(0);
  });

  it('I-13: XPHB Dragonborn → empty array (excluded source)', () => {
    const xphbDragonborn = makeBaseRow('dragonborn', 'XPHB');
    expect(expandDragonbornAncestries(xphbDragonborn)).toHaveLength(0);
  });
});
