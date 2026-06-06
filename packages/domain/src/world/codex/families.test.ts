/**
 * Unit tests for CATEGORY_FAMILY constant and familyOf helper.
 *
 * RED commit — written FIRST before implementation (strict TDD per CLAUDE.md §5).
 *
 * Design intent: FORK 2 (#1944) — split reference vs world-knowledge categories.
 * OQ1 resolution (#1946): constant + TODO #513 (DB-as-runtime-SoT deferred).
 * This arc encodes NO PHB rule — tests cite design decisions, not PHB pages.
 * REQ-CK-GATE-01, REQ-CK-DOMAIN-01, REQ-CK-DOMAIN-04.
 */
import { describe, it, expect } from 'vitest';
import { CATEGORY_FAMILY, familyOf } from './families.js';

// ── familyOf ─────────────────────────────────────────────────────────────────

describe('familyOf — FORK 2 (#1944) category→family routing split', () => {
  // Reference family: always visible to all players (PHB/SRD — player owns the manual)
  it("familyOf('spells') → 'reference'", () => {
    expect(familyOf('spells')).toBe('reference');
  });
  it("familyOf('items') → 'reference'", () => {
    expect(familyOf('items')).toBe('reference');
  });
  it("familyOf('classes') → 'reference'", () => {
    expect(familyOf('classes')).toBe('reference');
  });
  it("familyOf('races') → 'reference'", () => {
    expect(familyOf('races')).toBe('reference');
  });
  it("familyOf('backgrounds') → 'reference'", () => {
    expect(familyOf('backgrounds')).toBe('reference');
  });
  it("familyOf('feats') → 'reference'", () => {
    expect(familyOf('feats')).toBe('reference');
  });
  it("familyOf('conditions') → 'reference'", () => {
    expect(familyOf('conditions')).toBe('reference');
  });

  // World-knowledge family: gated by character_knowledge (anti-metagaming, FORK 2)
  it("familyOf('monsters') → 'world-knowledge'", () => {
    expect(familyOf('monsters')).toBe('world-knowledge');
  });
  it("familyOf('npcs') → 'world-knowledge'", () => {
    expect(familyOf('npcs')).toBe('world-knowledge');
  });
  it("familyOf('factions') → 'world-knowledge'", () => {
    expect(familyOf('factions')).toBe('world-knowledge');
  });
  it("familyOf('locations') → 'world-knowledge'", () => {
    expect(familyOf('locations')).toBe('world-knowledge');
  });
  it("familyOf('lore') → 'world-knowledge'", () => {
    expect(familyOf('lore')).toBe('world-knowledge');
  });

  // Unknown slugs return null (not a panic — tolerant)
  it("familyOf('unknown') → null", () => {
    expect(familyOf('unknown')).toBeNull();
  });
  it("familyOf('') → null", () => {
    expect(familyOf('')).toBeNull();
  });
  it("familyOf('dragons') → null (invalid slug; see REQ-CK-GATE-04 for API-level validation)", () => {
    expect(familyOf('dragons')).toBeNull();
  });
});

// ── CATEGORY_FAMILY constant ──────────────────────────────────────────────────

describe('CATEGORY_FAMILY — single source of truth (REQ-CK-GATE-01, REQ-CK-DOMAIN-04)', () => {
  it('contains all 7 reference slugs mapped to reference', () => {
    // OQ1 resolution (#1946): constant + TODO #513 (no inline if/else in components)
    const referenceSlugs = ['spells', 'items', 'classes', 'races', 'backgrounds', 'feats', 'conditions'];
    for (const slug of referenceSlugs) {
      expect(CATEGORY_FAMILY[slug]).toBe('reference');
    }
  });

  it('contains all 5 world-knowledge slugs mapped to world-knowledge', () => {
    const worldKnowledgeSlugs = ['monsters', 'npcs', 'factions', 'locations', 'lore'];
    for (const slug of worldKnowledgeSlugs) {
      expect(CATEGORY_FAMILY[slug]).toBe('world-knowledge');
    }
  });

  it('total count: 7 reference + 5 world-knowledge = 12 entries', () => {
    expect(Object.keys(CATEGORY_FAMILY).length).toBe(12);
  });
});
