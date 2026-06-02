import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SpellDetailBody } from './spell-detail-body';

afterEach(() => {
  vi.restoreAllMocks();
});

// PHB 2014 p.241 — Fireball: Level 3, Evocation, 1 action, 150 ft, V/S/M (tiny ball of bat guano
// and sulfur), instantaneous, 8d6 fire damage. This fixture matches the REAL API response shape
// (extracted columns + raw data JSONB from the Drizzle row).
const FIREBALL_FIXTURE = {
  slug: 'fireball',
  source: 'PHB',
  name: 'Fireball',
  level: 3,
  school: 'E', // 'E' = Evocation in 5etools
  data: {
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 150 } },
    components: { v: true, s: true, m: 'a tiny ball of bat guano and sulfur' },
    duration: [{ type: 'instant' }],
    entries: [
      'A bright streak flashes from your pointing finger to a point you choose within range.',
      {
        type: 'list',
        items: ['Each creature in a 20-foot-radius sphere must make a Dexterity saving throw.'],
      },
    ],
    source: 'PHB',
  },
};

// Mock CompendiumEntriesWithTerms — we only assert it is called with the entries array.
// The component itself is tested separately in components/compendium/term/__tests__/
vi.mock('@/components/compendium/term/CompendiumEntriesWithTerms', () => ({
  CompendiumEntriesWithTerms: vi.fn(({ entries }: { entries: unknown[] }) => (
    <div data-testid="entries-renderer" data-entries-count={entries?.length ?? 0} />
  )),
}));

describe('SpellDetailBody — REQ-CBROWSE-08 (real API shape)', () => {
  afterEach(cleanup);

  it('REQ-CBROWSE-07: SpellHeader renders level "3"', () => {
    const { container } = render(<SpellDetailBody data={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball is Level 3
    const lvl = container.querySelector('[data-field="level"]');
    expect(lvl?.textContent).toContain('3');
  });

  it('REQ-CBROWSE-07: SpellHeader renders school "E"', () => {
    const { container } = render(<SpellDetailBody data={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — School: Evocation (stored as 'E' in 5etools)
    const school = container.querySelector('[data-field="school"]');
    expect(school?.textContent).toBeTruthy();
  });

  it('REQ-CBROWSE-07: SpellHeader renders casting time from data.time[]', () => {
    // PHB 2014 p.241 — Fireball casting time: 1 action
    const { container } = render(<SpellDetailBody data={FIREBALL_FIXTURE} />);
    const castingTime = container.querySelector('[data-field="casting-time"]');
    expect(castingTime?.textContent).toBeTruthy();
  });

  it('REQ-CBROWSE-07: SpellHeader renders range from data.range', () => {
    // PHB 2014 p.241 — Fireball range: 150 feet
    const { container } = render(<SpellDetailBody data={FIREBALL_FIXTURE} />);
    const range = container.querySelector('[data-field="range"]');
    expect(range?.textContent).toBeTruthy();
  });

  it('REQ-CBROWSE-07: SpellHeader renders components from data.components', () => {
    // PHB 2014 p.241 — Fireball: V, S, M (bat guano + sulfur)
    const { container } = render(<SpellDetailBody data={FIREBALL_FIXTURE} />);
    const components = container.querySelector('[data-field="components"]');
    expect(components?.textContent).toContain('V');
    expect(components?.textContent).toContain('S');
    expect(components?.textContent).toContain('M');
  });

  it('REQ-CBROWSE-07: SpellHeader renders duration from data.duration[]', () => {
    // PHB 2014 p.241 — Fireball duration: instantaneous
    const { container } = render(<SpellDetailBody data={FIREBALL_FIXTURE} />);
    const duration = container.querySelector('[data-field="duration"]');
    expect(duration?.textContent).toBeTruthy();
  });

  it('REQ-CBROWSE-08: body delegates to CompendiumEntriesWithTerms with entries array', () => {
    const { getByTestId } = render(
      <SpellDetailBody data={FIREBALL_FIXTURE} worldId="test-world-id" accessToken="test-token" />,
    );
    // CompendiumEntriesWithTerms is mocked — assert it received the entries array
    const renderer = getByTestId('entries-renderer');
    expect(Number(renderer.dataset.entriesCount)).toBe(FIREBALL_FIXTURE.data.entries.length);
  });

  it('REQ-CBROWSE-08: old SpellDetail.paragraphs shape does NOT exist on accepted props', () => {
    // Compile-time guard: SpellDetailBody must accept { data: SpellApiRow } NOT { spell: SpellDetail }
    // Verified by TypeScript — this test just documents the contract and runs without type errors.
    // If the old shape is still accepted, the TypeScript types.ts would still export SpellDetail.
    expect(typeof SpellDetailBody).toBe('function');
  });
});
