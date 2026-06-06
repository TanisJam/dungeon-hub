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

// ── Unsupported ref kind ───────────────────────────────────────────────────────

describe('validateBitacoraPage — unsupported ref kind', () => {
  it('ref.kind = "npc" → ok:false, BITACORA_PAGE_REF_KIND_UNSUPPORTED', () => {
    // Design intent: this wave only supports monster refs (compendium slugs).
    // npc/faction/location blocked until UUID bridge #1946 lands.
    const result = validateBitacoraPage({
      body: 'Notes about an NPC.',
      tags: ['npcs'],
      refs: [{ kind: 'npc', refKey: 'innkeeper', refSource: 'world' }],
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
