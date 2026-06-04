import { describe, it, expect } from 'vitest';
import { buildMatrix } from './_matrix';
import type { ComponentEntry } from './_registry-types';

// Minimal entry factory for tests — keeps tests focused on matrix logic.
function makeEntry(overrides: Partial<ComponentEntry>): ComponentEntry {
  return {
    id: 'test',
    name: 'Test',
    group: 'ui',
    propsSchema: {},
    render: (p) => null,
    ...overrides,
  };
}

describe('buildMatrix', () => {
  it('(a) no-axes entry returns exactly 1 combination', () => {
    const entry = makeEntry({});
    const result = buildMatrix(entry);
    expect(result).toHaveLength(1);
  });

  it('(b) cartesian 2-value × 3-value axes returns 6 combinations', () => {
    const entry = makeEntry({
      variantAxes: {
        tone: ['cta', 'ghost'],
        size: ['sm', 'md', 'lg'],
      },
    });
    const result = buildMatrix(entry);
    expect(result).toHaveLength(6);
  });

  it('(c) list mode returns combos equal to explicitCombos.length', () => {
    const entry = makeEntry({
      matrixMode: 'list',
      explicitCombos: [{ name: 'shield' }, { name: 'sword' }, { name: 'scroll' }],
    });
    const result = buildMatrix(entry);
    expect(result).toHaveLength(3);
  });

  it('(d) combo.label is axis values joined with " · "', () => {
    const entry = makeEntry({
      variantAxes: {
        tone: ['cta'],
        size: ['md'],
      },
    });
    const [combo] = buildMatrix(entry);
    expect(combo.label).toBe('cta · md');
  });

  it('(e) schema defaults merged under fixedProps, then axisValues', () => {
    const entry = makeEntry({
      propsSchema: {
        tone: { kind: 'enum', options: ['cta', 'ghost'], default: 'cta' },
        size: { kind: 'enum', options: ['sm', 'md'], default: 'md' },
        children: { kind: 'string', default: 'Hello' },
      },
      fixedProps: { children: 'Fixed' },
      variantAxes: {
        tone: ['ghost'],
      },
    });
    const [combo] = buildMatrix(entry);
    // axisValues override defaults; fixedProps override defaults but NOT axisValues
    expect(combo.props).toMatchObject({
      tone: 'ghost',   // from axis
      size: 'md',      // from schema default
      children: 'Fixed', // from fixedProps
    });
  });
});
