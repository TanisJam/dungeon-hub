import { describe, it, expect } from 'vitest';
import { formatLineage } from './lineage.js';

describe('formatLineage', () => {
  it('FL-SINGLE-CLASS-01: single class, no subrace → "{race} · {class} {level}"', () => {
    expect(
      formatLineage({
        race: { name: 'Humano', slug: 'human' },
        classes: [{ name: 'Guerrero', slug: 'fighter', level: 3 }],
      }),
    ).toBe('Humano · Guerrero 3');
  });

  it('FL-SINGLE-CLASS-01: subrace overrides race name', () => {
    expect(
      formatLineage({
        race: { name: 'Elfo', slug: 'elf' },
        subrace: { name: 'Elfo de luna', slug: 'moon-elf' },
        classes: [{ name: 'Mago', slug: 'wizard', level: 5 }],
      }),
    ).toBe('Elfo de luna · Mago 5');
  });

  it('FL-SUBCLASS-02: subclass rendered in parens', () => {
    expect(
      formatLineage({
        race: { name: 'Semielfo', slug: 'half-elf' },
        classes: [
          { name: 'Bardo', slug: 'bard', level: 4, subclassName: 'Colegio del Saber' },
        ],
      }),
    ).toBe('Semielfo · Bardo (Colegio del Saber) 4');
  });

  it('FL-MULTICLASS-03: multiclass sorted by level desc, joined with " / "', () => {
    expect(
      formatLineage({
        race: { name: 'Mediano', slug: 'halfling' },
        classes: [
          { name: 'Pícaro', slug: 'rogue', level: 1 },
          { name: 'Bardo', slug: 'bard', level: 3 },
        ],
      }),
    ).toBe('Mediano · Bardo 3 / Pícaro 1');
  });

  it('FL-MISSING-NAME-04: missing class name falls back to capitalized slug', () => {
    expect(
      formatLineage({
        race: { name: 'Humano', slug: 'human' },
        classes: [{ slug: 'warlock', level: 2 }],
      }),
    ).toBe('Humano · Warlock 2');
  });

  it('FL-NO-CLASSES-05: no classes → race only', () => {
    expect(
      formatLineage({
        race: { name: 'Tiefling', slug: 'tiefling' },
        classes: [],
      }),
    ).toBe('Tiefling');
  });
});
