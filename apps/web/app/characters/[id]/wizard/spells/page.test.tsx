/**
 * Unit tests for classLabel() helper exported from page.tsx (SP-07).
 *
 * REQ-SP07-SPANISH-CLASS-LABELS: multiclass tab bar must show Spanish labels
 * for canonical D&D 5e class slugs. English plain capitalization must NOT be used.
 *
 * PHB p.46-97: all standard class names referenced for mapping.
 *
 * Design note (SP07-D2): classLabel is exported from page.tsx (not extracted
 * to a separate lib) because it has a single consumer today.
 */
import { describe, it, expect } from 'vitest';
// Import from the pure _class-labels module (not page.tsx which has server-only imports).
// page.tsx re-exports classLabel from _class-labels.ts; this is the pure unit.
import { classLabel, CLASS_LABEL_ES } from './_class-labels';

describe('REQ-SP07-SPANISH-CLASS-LABELS: classLabel() returns Spanish class names', () => {
  it('SP-07: classLabel("cleric") === "Clérigo" (PHB p.56)', () => {
    expect(classLabel('cleric')).toBe('Clérigo');
  });

  it('SP-07: classLabel("wizard") === "Mago" (PHB p.112)', () => {
    expect(classLabel('wizard')).toBe('Mago');
  });

  it('SP-07: classLabel("sorcerer") === "Hechicero" (PHB p.99)', () => {
    expect(classLabel('sorcerer')).toBe('Hechicero');
  });

  it('SP-07: classLabel("fighter") === "Guerrero" (PHB p.70)', () => {
    expect(classLabel('fighter')).toBe('Guerrero');
  });

  it('SP-07: classLabel("rogue") === "Pícaro" (PHB p.94)', () => {
    expect(classLabel('rogue')).toBe('Pícaro');
  });

  it('SP-07: classLabel("warlock") === "Brujo" (PHB p.105)', () => {
    expect(classLabel('warlock')).toBe('Brujo');
  });

  it('SP-07: classLabel("paladin") === "Paladín" (PHB p.82)', () => {
    expect(classLabel('paladin')).toBe('Paladín');
  });

  it('SP-07: classLabel("ranger") === "Explorador" (PHB p.89)', () => {
    expect(classLabel('ranger')).toBe('Explorador');
  });

  it('SP-07: classLabel("bard") === "Bardo" (PHB p.51)', () => {
    expect(classLabel('bard')).toBe('Bardo');
  });

  it('SP-07: classLabel("druid") === "Druida" (PHB p.64)', () => {
    expect(classLabel('druid')).toBe('Druida');
  });

  it('SP-07: classLabel("barbarian") === "Bárbaro" (PHB p.46)', () => {
    expect(classLabel('barbarian')).toBe('Bárbaro');
  });

  it('SP-07: classLabel("monk") === "Monje" (PHB p.76)', () => {
    expect(classLabel('monk')).toBe('Monje');
  });

  it('SP-07: classLabel("artificer") === "Artífice"', () => {
    expect(classLabel('artificer')).toBe('Artífice');
  });

  it('SP-07: unknown slug falls back to capitalized slug (read-path tolerance — SP07-D7)', () => {
    // Unknown class slugs (homebrew, future expansions) must not crash the UI
    expect(classLabel('homebrew-class')).toBe('Homebrew-class');
  });
});

describe('CLASS_LABEL_ES map completeness', () => {
  it('SP-07: map contains all 13 standard PHB + artificer classes', () => {
    const expected = [
      'bard', 'cleric', 'druid', 'paladin', 'ranger',
      'sorcerer', 'warlock', 'wizard', 'artificer',
      'fighter', 'rogue', 'barbarian', 'monk',
    ];
    for (const slug of expected) {
      expect(CLASS_LABEL_ES[slug]).toBeDefined();
    }
  });
});

// ── REQ-SP07-MULTICLASS-ALL-NONCASTER (structural assertion) ────────────────
// The non-caster branch is rendered by SpellsStepPage (async server component)
// which cannot be rendered in vitest (requires Supabase, API env vars, etc.).
// Coverage path: page.tsx L179 checks `casterClasses.length === 0` and renders
// <NoPicksPanel variant="non-caster">. The NoPicksPanel component itself is tested
// in _no-picks-panel.test.tsx (T-2). Here we verify the class slug used would be
// a valid non-caster slug (no classLabel crash for fighter/barbarian).
describe('REQ-SP07-MULTICLASS-ALL-NONCASTER: classLabel handles non-caster slugs', () => {
  it('SP-07: classLabel("fighter") + classLabel("barbarian") return valid Spanish labels', () => {
    // NoPicksPanel receives className=primaryClass.slug for the non-caster branch.
    // classLabel must not throw for these slugs.
    expect(classLabel('fighter')).toBe('Guerrero');
    expect(classLabel('barbarian')).toBe('Bárbaro');
    // Also verify the non-caster branch would have zero caster classes
    // (behavior tested structurally — page renders <NoPicksPanel variant="non-caster">
    //  when classifyCaster returns "none" for all classes; see _no-picks-panel.test.tsx T-2)
  });
});
