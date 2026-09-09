/**
 * homebrewSourceCode — per-world homebrew compendium source code.
 *
 * Custom content via JSON upload (MVP #3.8, DEC-1 locked 2026-06-04: JSON
 * upload, not visual authoring). Homebrew items land in the SAME global
 * `compendium_items` table as official content (unique index on
 * (slug, source), see apps/api/src/infra/db/schema.ts) — there is no
 * per-world table to isolate homebrew in. Deriving the source code from the
 * worldId is what makes that global table safe for per-world content:
 * a single shared "HB" code would (a) collide when two DMs both homebrew
 * a "Blade of Dawn" (same slug, same source → unique-index clash or
 * cross-world overwrite) and (b) leak one world's homebrew into any other
 * world that also enabled "HB". See docs/manuals/conflict-resolution.md
 * for how `rulesProfile.sources` gates visibility per world.
 */
import { describe, expect, it } from 'vitest';
import { homebrewSourceCode } from './source-code.js';

describe('homebrewSourceCode', () => {
  it('derives "HB-" + first 8 hex chars of the worldId, dashes stripped', () => {
    expect(homebrewSourceCode('4dc54680-c40b-4a1e-8f2a-abcdef123456')).toBe('HB-4dc54680');
  });

  it('is deterministic for the same worldId', () => {
    const worldId = '11111111-2222-3333-4444-555555555555';
    expect(homebrewSourceCode(worldId)).toBe(homebrewSourceCode(worldId));
  });

  it('differs across worlds — the collision this design avoids', () => {
    const a = homebrewSourceCode('aaaaaaaa-0000-0000-0000-000000000000');
    const b = homebrewSourceCode('bbbbbbbb-0000-0000-0000-000000000000');
    expect(a).not.toBe(b);
  });
});
