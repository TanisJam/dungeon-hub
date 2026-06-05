/**
 * Tests for CODEX_DM_SUBNAV_ITEMS shared const.
 * CT-05 — REQ-DPPMD-CODEX-01/02/03.
 *
 * SCENARIO CODEX-S1: DM SubNav has 4 entries including Compendio.
 * SCENARIO CODEX-S2/S3: Compendio entry present (same const used on all 3 DM codex pages).
 */
import { describe, it, expect } from 'vitest';
import { CODEX_DM_SUBNAV_ITEMS } from './codex-subnav-items';

describe('CODEX_DM_SUBNAV_ITEMS', () => {
  it('CODEX-S1: has exactly 4 entries', () => {
    expect(CODEX_DM_SUBNAV_ITEMS).toHaveLength(4);
  });

  it('CODEX-S1: contains Compendio entry with href /codex/compendio', () => {
    expect(CODEX_DM_SUBNAV_ITEMS.some((i) => i.href === '/codex/compendio')).toBe(true);
  });

  it('CODEX-S2/S3: contains all 3 original DM entries', () => {
    const hrefs = CODEX_DM_SUBNAV_ITEMS.map((i) => i.href);
    expect(hrefs).toContain('/codex/facciones');
    expect(hrefs).toContain('/codex/npcs');
    expect(hrefs).toContain('/codex/quests');
  });

  it('contains Compendio label', () => {
    expect(CODEX_DM_SUBNAV_ITEMS.some((i) => i.label === 'Compendio')).toBe(true);
  });
});
