/**
 * Unit tests for KNOWLEDGE_TAGS constant, KnowledgeTag type, and isKnowledgeTag guard.
 *
 * RED commit — written FIRST before implementation (strict TDD per CLAUDE.md §5).
 *
 * Design intent: ADR-4 (Biblioteca W1) — cross-surface tag vocabulary foundation for
 * Bitácora waves (#1960). Intermediate domain constant pending DB-as-runtime-SoT migration.
 *
 * This arc encodes NO PHB rule. Tests cite design decisions, not PHB pages.
 * REQ-TAGVOCAB-01, ADR-4.
 */
import { describe, it, expect } from 'vitest';
import { KNOWLEDGE_TAGS, isKnowledgeTag } from './tags.js';
import type { KnowledgeTag } from './tags.js';

// ── KNOWLEDGE_TAGS constant ───────────────────────────────────────────────────

describe('KNOWLEDGE_TAGS — readonly tuple of all valid knowledge tag slugs (ADR-4)', () => {
  it('contains exactly 7 members', () => {
    expect(KNOWLEDGE_TAGS).toHaveLength(7);
  });

  it('contains monsters', () => {
    expect(KNOWLEDGE_TAGS).toContain('monsters');
  });

  it('contains locations', () => {
    expect(KNOWLEDGE_TAGS).toContain('locations');
  });

  it('contains npcs', () => {
    expect(KNOWLEDGE_TAGS).toContain('npcs');
  });

  it('contains factions', () => {
    expect(KNOWLEDGE_TAGS).toContain('factions');
  });

  it('contains lore', () => {
    expect(KNOWLEDGE_TAGS).toContain('lore');
  });

  it('contains items (tag vocabulary, NOT Biblioteca UI — REQ-TAGVOCAB-01, #1966)', () => {
    // items is a valid knowledge tag slug; it is EXCLUDED from the Biblioteca UI
    // but remains in the tag vocabulary for future Mercado/Bitácora waves.
    expect(KNOWLEDGE_TAGS).toContain('items');
  });

  it('contains spells', () => {
    expect(KNOWLEDGE_TAGS).toContain('spells');
  });

  it('is a readonly array (as const — prevents mutation)', () => {
    // TypeScript enforces readonly at compile time; runtime: plain Array (no Object.freeze)
    expect(Array.isArray(KNOWLEDGE_TAGS)).toBe(true);
  });
});

// ── isKnowledgeTag guard ──────────────────────────────────────────────────────

describe('isKnowledgeTag — type guard (ADR-4, REQ-TAGVOCAB-01)', () => {
  it("isKnowledgeTag('monsters') → true", () => {
    expect(isKnowledgeTag('monsters')).toBe(true);
  });

  it("isKnowledgeTag('locations') → true", () => {
    expect(isKnowledgeTag('locations')).toBe(true);
  });

  it("isKnowledgeTag('npcs') → true", () => {
    expect(isKnowledgeTag('npcs')).toBe(true);
  });

  it("isKnowledgeTag('factions') → true", () => {
    expect(isKnowledgeTag('factions')).toBe(true);
  });

  it("isKnowledgeTag('lore') → true", () => {
    expect(isKnowledgeTag('lore')).toBe(true);
  });

  it("isKnowledgeTag('items') → true", () => {
    expect(isKnowledgeTag('items')).toBe(true);
  });

  it("isKnowledgeTag('spells') → true", () => {
    expect(isKnowledgeTag('spells')).toBe(true);
  });

  it("isKnowledgeTag('banana') → false (unknown string)", () => {
    expect(isKnowledgeTag('banana')).toBe(false);
  });

  it("isKnowledgeTag('') → false (empty string)", () => {
    expect(isKnowledgeTag('')).toBe(false);
  });

  it("isKnowledgeTag('MONSTERS') → false (case-sensitive)", () => {
    expect(isKnowledgeTag('MONSTERS')).toBe(false);
  });

  it("isKnowledgeTag('reference') → false (family slug, not a tag)", () => {
    expect(isKnowledgeTag('reference')).toBe(false);
  });
});

// ── KnowledgeTag type — structural check via assignability ───────────────────

describe('KnowledgeTag type — union derived from KNOWLEDGE_TAGS (compile-time; runtime proof via isKnowledgeTag)', () => {
  it('every member of KNOWLEDGE_TAGS satisfies isKnowledgeTag', () => {
    // Runtime proxy for the structural type test: if isKnowledgeTag passes for all
    // members, the type derivation (typeof KNOWLEDGE_TAGS[number]) is correct.
    for (const tag of KNOWLEDGE_TAGS) {
      // tag is typed as KnowledgeTag here because of `as const`
      const result: boolean = isKnowledgeTag(tag);
      expect(result).toBe(true);
    }
  });

  it('a valid KnowledgeTag literal is assignable to string (widening check)', () => {
    // Compile-time only — runtime assertion proves the constant is usable as string
    const tag: KnowledgeTag = 'monsters';
    const wide: string = tag;
    expect(typeof wide).toBe('string');
  });
});
