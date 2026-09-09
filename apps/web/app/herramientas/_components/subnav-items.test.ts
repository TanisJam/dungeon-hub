/**
 * Tests for HERRAMIENTAS_SUBNAV_ITEMS shared const.
 * Biblioteca W1 — moved + updated from codex-subnav-items.test.ts.
 *
 * SCENARIO HERRAMIENTAS-S1: DM SubNav has 3 entries (Compendio pill removed).
 * SCENARIO HERRAMIENTAS-S2/S3: All DM tool hrefs point to /herramientas/*.
 *
 * REQ-DMTOOLS-01, ADR-2.
 */
import { describe, it, expect } from 'vitest';
import { HERRAMIENTAS_SUBNAV_ITEMS } from './subnav-items';

describe('HERRAMIENTAS_SUBNAV_ITEMS', () => {
  it('HERRAMIENTAS-S1: has exactly 5 entries (Compendio pill removed, Tienda + Contenido added)', () => {
    expect(HERRAMIENTAS_SUBNAV_ITEMS).toHaveLength(5);
  });

  it('HERRAMIENTAS-S1: does NOT contain a Compendio entry (DM uses Biblioteca tab)', () => {
    expect(HERRAMIENTAS_SUBNAV_ITEMS.some((i) => i.label === 'Compendio')).toBe(false);
    expect(HERRAMIENTAS_SUBNAV_ITEMS.some((i) => i.href.includes('/compendio'))).toBe(false);
  });

  it('HERRAMIENTAS-S2: contains Facciones entry with href /herramientas/facciones', () => {
    const item = HERRAMIENTAS_SUBNAV_ITEMS.find((i) => i.href === '/herramientas/facciones');
    expect(item).toBeTruthy();
    expect(item!.label).toBe('Facciones');
  });

  it('HERRAMIENTAS-S3: contains NPCs entry with href /herramientas/npcs', () => {
    const item = HERRAMIENTAS_SUBNAV_ITEMS.find((i) => i.href === '/herramientas/npcs');
    expect(item).toBeTruthy();
    expect(item!.label).toBe('NPCs');
  });

  it('HERRAMIENTAS-S3: contains Quests entry with href /herramientas/quests', () => {
    const item = HERRAMIENTAS_SUBNAV_ITEMS.find((i) => i.href === '/herramientas/quests');
    expect(item).toBeTruthy();
    expect(item!.label).toBe('Quests');
  });

  it('market-shop-dm-stock-web 3d: contains Tienda entry with href /herramientas/tienda', () => {
    const item = HERRAMIENTAS_SUBNAV_ITEMS.find((i) => i.href === '/herramientas/tienda');
    expect(item).toBeTruthy();
    expect(item!.label).toBe('Tienda');
  });

  it('MVP #3.8: contains Contenido entry with href /herramientas/contenido', () => {
    const item = HERRAMIENTAS_SUBNAV_ITEMS.find((i) => i.href === '/herramientas/contenido');
    expect(item).toBeTruthy();
    expect(item!.label).toBe('Contenido');
  });

  it('no /codex/* hrefs remain — all updated to /herramientas/*', () => {
    for (const item of HERRAMIENTAS_SUBNAV_ITEMS) {
      expect(item.href).not.toMatch(/^\/codex/);
    }
  });
});
