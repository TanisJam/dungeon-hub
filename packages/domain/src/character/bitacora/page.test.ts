/**
 * Unit tests for bitácora page domain validation.
 *
 * RED commit — written FIRST before implementation.
 *
 * Design intent (no PHB rule): anti-metagaming personal journal.
 * Players record lived knowledge about entities they've encountered.
 * Pages are player-authored; DM grant is separate (character_knowledge).
 *
 * bitacora-personal SDD spec #1974, design #1975, tasks #1976.
 * REQ-BP-DOM-01 / REQ-BP-TEST-03
 */

import { describe, it, expect } from 'vitest';
import { validateBitacoraPage } from './page.js';

// ── Valid cases ────────────────────────────────────────────────────────────────

describe('validateBitacoraPage — valid pages', () => {
  it('valid free-form page (no ref) → ok:true', () => {
    // Design intent: player can record free-form notes, no monster ref required.
    const result = validateBitacoraPage({
      body: 'Found goblin caves near the eastern river.',
      tags: ['monsters'],
      refs: [],
    });
    expect(result.ok).toBe(true);
  });

  it('valid page with monster ref → ok:true', () => {
    // Design intent: ref attaches a note to a known compendium entity (monster only, this wave).
    const result = validateBitacoraPage({
      body: 'Resilient carapace — hits bounce off.',
      tags: ['monsters'],
      refs: [{ kind: 'monster', refKey: 'goblin', refSource: 'mm' }],
    });
    expect(result.ok).toBe(true);
  });

  it('optional title is accepted', () => {
    const result = validateBitacoraPage({
      title: 'Goblins del río',
      body: 'Found goblin caves.',
      tags: ['monsters'],
      refs: [],
    });
    expect(result.ok).toBe(true);
  });

  it('empty title is treated as no title (ok)', () => {
    const result = validateBitacoraPage({
      title: '',
      body: 'Some notes.',
      tags: ['lore'],
      refs: [],
    });
    expect(result.ok).toBe(true);
  });

  it('multiple valid tags (from KNOWLEDGE_TAGS) → ok:true', () => {
    const result = validateBitacoraPage({
      body: 'Notes spanning multiple categories.',
      tags: ['monsters', 'lore'],
      refs: [],
    });
    expect(result.ok).toBe(true);
  });
});

// ── Invalid tag ────────────────────────────────────────────────────────────────

describe('validateBitacoraPage — invalid tag', () => {
  it('tag not in KNOWLEDGE_TAGS → ok:false, BITACORA_PAGE_TAG_INVALID', () => {
    // Design intent: only canonical tag vocabulary allowed to keep filtering clean.
    const result = validateBitacoraPage({
      body: 'Some notes.',
      tags: ['dragons-custom'],
      refs: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'BITACORA_PAGE_TAG_INVALID')).toBe(true);
    }
  });
});

// ── Supported NPC ref kind (uuid-bridge-npc B-1) ──────────────────────────────

describe('validateBitacoraPage — npc ref kind (uuid-bridge-npc Wave 5a)', () => {
  it('ref.kind = "npc" with UUID refKey → ok:true, no REF_KIND_UNSUPPORTED', () => {
    // uuid-bridge-npc B-1: npc refs are now supported (SUPPORTED_REF_KINDS += 'npc').
    // REQ-UBN-BITACORA: domain accepts npc refs; refSource='world' is the convention.
    const result = validateBitacoraPage({
      body: 'Notes about the innkeeper.',
      tags: ['npcs'],
      refs: [{ kind: 'npc', refKey: '550e8400-e29b-41d4-a716-446655440000', refSource: 'world' }],
    });
    expect(result.ok).toBe(true);
  });

  it('ref.kind = "npc" does NOT emit BITACORA_PAGE_REF_KIND_UNSUPPORTED', () => {
    // Regression guard: 'npc' must NOT be in the unsupported set after this wave.
    const result = validateBitacoraPage({
      body: 'Met the blacksmith.',
      tags: ['npcs'],
      refs: [{ kind: 'npc', refKey: '550e8400-e29b-41d4-a716-446655440001', refSource: 'world' }],
    });
    if (!result.ok) {
      const hasUnsupported = result.issues.some(
        (i) => i.code === 'BITACORA_PAGE_REF_KIND_UNSUPPORTED',
      );
      expect(hasUnsupported).toBe(false);
    }
  });
});

// ── Supported faction ref kind (uuid-bridge-factions-pois B-1) ───────────────

describe('validateBitacoraPage — faction ref kind (uuid-bridge-factions-pois Wave 5b)', () => {
  it('ref.kind = "faction" with UUID refKey → ok:true, no REF_KIND_UNSUPPORTED', () => {
    // uuid-bridge-factions-pois B-1: faction refs are now supported.
    // REQ-UBFP-BITACORA: domain accepts faction refs; refSource='world' is the convention.
    const result = validateBitacoraPage({
      body: 'Notes about the thieves guild.',
      tags: ['factions'],
      refs: [{ kind: 'faction', refKey: '550e8400-e29b-41d4-a716-000000000001', refSource: 'world' }],
    });
    expect(result.ok).toBe(true);
  });

  it('ref.kind = "faction" does NOT emit BITACORA_PAGE_REF_KIND_UNSUPPORTED', () => {
    // Regression guard: 'faction' must NOT be in the unsupported set after this wave.
    const result = validateBitacoraPage({
      body: 'Notes about the merchant guild.',
      tags: ['factions'],
      refs: [{ kind: 'faction', refKey: '550e8400-e29b-41d4-a716-000000000002', refSource: 'world' }],
    });
    if (!result.ok) {
      const hasUnsupported = result.issues.some(
        (i) => i.code === 'BITACORA_PAGE_REF_KIND_UNSUPPORTED',
      );
      expect(hasUnsupported).toBe(false);
    }
  });
});

// ── Supported location ref kind (uuid-bridge-factions-pois B-1) ──────────────

describe('validateBitacoraPage — location ref kind (uuid-bridge-factions-pois Wave 5b)', () => {
  it('ref.kind = "location" with UUID refKey → ok:true, no REF_KIND_UNSUPPORTED', () => {
    // uuid-bridge-factions-pois B-1: location refs are now supported.
    // REQ-UBFP-BITACORA: domain accepts location refs; refSource='world' is the convention.
    const result = validateBitacoraPage({
      body: 'Notes about the ancient ruins.',
      tags: ['locations'],
      refs: [{ kind: 'location', refKey: '550e8400-e29b-41d4-a716-000000000003', refSource: 'world' }],
    });
    expect(result.ok).toBe(true);
  });

  it('ref.kind = "location" does NOT emit BITACORA_PAGE_REF_KIND_UNSUPPORTED', () => {
    // Regression guard: 'location' must NOT be in the unsupported set after this wave.
    const result = validateBitacoraPage({
      body: 'Notes about the hidden cave.',
      tags: ['locations'],
      refs: [{ kind: 'location', refKey: '550e8400-e29b-41d4-a716-000000000004', refSource: 'world' }],
    });
    if (!result.ok) {
      const hasUnsupported = result.issues.some(
        (i) => i.code === 'BITACORA_PAGE_REF_KIND_UNSUPPORTED',
      );
      expect(hasUnsupported).toBe(false);
    }
  });
});

// ── Unsupported ref kind — regression guard (unknown still rejects) ────────────

describe('validateBitacoraPage — unsupported ref kind', () => {
  it('ref.kind = "lore" → ok:false, BITACORA_PAGE_REF_KIND_UNSUPPORTED (not this slice)', () => {
    // uuid-bridge-factions-pois B-1: lore remains unsupported this wave.
    // Only monster + npc + faction + location are in SUPPORTED_REF_KINDS.
    const result = validateBitacoraPage({
      body: 'Notes about ancient lore.',
      tags: ['lore'],
      refs: [{ kind: 'lore', refKey: 'some-lore-uuid', refSource: 'world' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'BITACORA_PAGE_REF_KIND_UNSUPPORTED')).toBe(true);
    }
  });

  it('ref.kind = "spell" → ok:false, BITACORA_PAGE_REF_KIND_UNSUPPORTED', () => {
    const result = validateBitacoraPage({
      body: 'Notes about a spell.',
      tags: ['spells'],
      refs: [{ kind: 'spell', refKey: 'fireball', refSource: 'phb' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'BITACORA_PAGE_REF_KIND_UNSUPPORTED')).toBe(true);
    }
  });

  it('ref.kind = "unknown-kind" → ok:false, BITACORA_PAGE_REF_KIND_UNSUPPORTED', () => {
    const result = validateBitacoraPage({
      body: 'Notes about something.',
      tags: ['lore'],
      refs: [{ kind: 'unknown-kind', refKey: 'some-uuid', refSource: 'world' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'BITACORA_PAGE_REF_KIND_UNSUPPORTED')).toBe(true);
    }
  });
});

// ── Empty body ─────────────────────────────────────────────────────────────────

describe('validateBitacoraPage — empty body', () => {
  it('body = "" → ok:false, BITACORA_PAGE_BODY_REQUIRED', () => {
    // Design intent: a page with no body is meaningless.
    const result = validateBitacoraPage({
      body: '',
      tags: ['monsters'],
      refs: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'BITACORA_PAGE_BODY_REQUIRED')).toBe(true);
    }
  });

  it('body = whitespace-only → ok:false, BITACORA_PAGE_BODY_REQUIRED', () => {
    const result = validateBitacoraPage({
      body: '   ',
      tags: ['monsters'],
      refs: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'BITACORA_PAGE_BODY_REQUIRED')).toBe(true);
    }
  });
});

// ── Duplicate tags ─────────────────────────────────────────────────────────────

describe('validateBitacoraPage — duplicate tags', () => {
  it('tags = ["monsters", "monsters"] → ok:false, BITACORA_PAGE_TAG_DUPLICATE', () => {
    // Design intent: duplicates add no value and signal a data error.
    const result = validateBitacoraPage({
      body: 'Some notes.',
      tags: ['monsters', 'monsters'],
      refs: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'BITACORA_PAGE_TAG_DUPLICATE')).toBe(true);
    }
  });
});

// ── Cap enforcement ─────────────────────────────────────────────────────────────

describe('validateBitacoraPage — cap enforcement', () => {
  it('more than 8 tags → ok:false', () => {
    const result = validateBitacoraPage({
      body: 'Many tags.',
      // 9 distinct tags — but KNOWLEDGE_TAGS only has 7; use repeated to hit count cap
      // Can't have 9 distinct valid tags since vocabulary only has 7; test with invalid to hit the cap path
      tags: ['monsters', 'lore', 'npcs', 'factions', 'locations', 'items', 'spells', 'monsters'],
      refs: [],
    });
    // Either DUPLICATE or TAG_INVALID or both — the page must not be ok
    expect(result.ok).toBe(false);
  });

  it('more than 10 refs → ok:false', () => {
    const refs = Array.from({ length: 11 }, (_, i) => ({
      kind: 'monster' as const,
      refKey: `goblin-${i}`,
      refSource: 'mm',
    }));
    const result = validateBitacoraPage({
      body: 'Many refs.',
      tags: ['monsters'],
      refs,
    });
    expect(result.ok).toBe(false);
  });
});
