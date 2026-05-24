import { describe, expect, it } from 'vitest';
import { requiresSubrace } from './subrace-required.js';

describe('requiresSubrace — PHB required races', () => {
  it('D-1: dwarf PHB → true', () => {
    expect(requiresSubrace({ slug: 'dwarf', source: 'PHB' })).toBe(true);
  });

  it('D-2: elf PHB → true', () => {
    expect(requiresSubrace({ slug: 'elf', source: 'PHB' })).toBe(true);
  });

  it('D-3: gnome PHB → true', () => {
    expect(requiresSubrace({ slug: 'gnome', source: 'PHB' })).toBe(true);
  });

  it('D-4: halfling PHB → true', () => {
    expect(requiresSubrace({ slug: 'halfling', source: 'PHB' })).toBe(true);
  });
});

describe('requiresSubrace — non-required races', () => {
  it('D-5: human PHB → false', () => {
    expect(requiresSubrace({ slug: 'human', source: 'PHB' })).toBe(false);
  });

  it('D-6: dragonborn PHB → false', () => {
    expect(requiresSubrace({ slug: 'dragonborn', source: 'PHB' })).toBe(false);
  });

  it('D-7: half-elf PHB → false', () => {
    expect(requiresSubrace({ slug: 'half-elf', source: 'PHB' })).toBe(false);
  });

  it('D-8: half-orc PHB → false', () => {
    expect(requiresSubrace({ slug: 'half-orc', source: 'PHB' })).toBe(false);
  });

  it('D-9: tiefling PHB → false', () => {
    expect(requiresSubrace({ slug: 'tiefling', source: 'PHB' })).toBe(false);
  });

  it('D-10: custom-lineage TCE → false (regression guard)', () => {
    expect(requiresSubrace({ slug: 'custom-lineage', source: 'TCE' })).toBe(false);
  });

  it('D-11: dwarf HOMEBREW → false (slug alone is not enough)', () => {
    expect(requiresSubrace({ slug: 'dwarf', source: 'HOMEBREW' })).toBe(false);
  });
});
