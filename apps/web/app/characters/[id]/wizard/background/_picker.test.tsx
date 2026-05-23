/**
 * B.4 — Picker unit tests: MultiSelectChoose tool-choose block
 *
 * Tests that BackgroundDetailInline renders a MultiSelectChoose block
 * when parsed.toolChoose is non-null, and omits it when null.
 *
 * BackgroundDetailInline is a local component inside _picker.tsx.
 * We test it indirectly via a thin wrapper that mirrors its signature
 * using the same ParsedBackground type.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import type { ParsedBackground, BackgroundData } from './_parsers';

// ---------------------------------------------------------------------------
// Thin inline wrapper that mirrors BackgroundDetailInline signature
// We render BackgroundPicker with mocked entries and a pre-selected background
// that carries toolChoose, so BackgroundDetailInline renders in "selected" mode.
// ---------------------------------------------------------------------------

// We need to mock the server action and next/navigation
vi.mock('./actions', () => ({
  saveBackground: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/characters/test-id/wizard/background',
}));

import { BackgroundPicker, type BackgroundEntry } from './_picker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(toolChoose: ParsedBackground['toolChoose']): BackgroundEntry {
  // Build a BackgroundData that will produce the desired toolChoose via parseBackground.
  // Since we already tested the parser, we just construct the 5etools shape.
  const toolProficiencies: BackgroundData['toolProficiencies'] =
    toolChoose !== null
      ? [
          {
            choose: {
              from: toolChoose.from, // pass literal slugs — expandToolFrom passes them through
              count: toolChoose.count,
            },
          } as never,
        ]
      : [];

  return {
    slug: 'test-bg',
    source: 'TEST',
    name: 'Test Background',
    data: {
      name: 'Test Background',
      source: 'TEST',
      skillProficiencies: [{ choose: { from: ['arcana', 'history'], count: 2 } }],
      toolProficiencies,
    },
  };
}

function makeAcolyteEntry(): BackgroundEntry {
  return {
    slug: 'acolyte',
    source: 'PHB',
    name: 'Acolyte',
    data: {
      name: 'Acolyte',
      source: 'PHB',
      skillProficiencies: [{ choose: { from: ['insight', 'religion'], count: 2 } }],
      toolProficiencies: [],
    },
  };
}

// ---------------------------------------------------------------------------
// B.4a — MultiSelectChoose renders when toolChoose is non-null
// ---------------------------------------------------------------------------

describe('BackgroundPicker — toolChoose block renders when non-null', () => {
  it('renders both tool options as clickable buttons when toolChoose has 2 items', () => {
    const entry = makeEntry({ from: ['foo', 'bar'], count: 1 });
    const initialSelection = {
      slug: entry.slug,
      source: entry.source,
      skillChoices: [],
      languageChoices: [],
      toolChoices: {},
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[entry]}
        initialSelection={initialSelection}
      />,
    );

    // The MultiSelectChoose section should be visible (in the expanded detail)
    // since the entry is already selected. Look for the tool option buttons.
    expect(screen.getByRole('button', { name: 'Foo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bar' })).toBeTruthy();
  });

  it('allows picking one option (clicking toggles selection)', () => {
    const entry = makeEntry({ from: ['lute', 'drum'], count: 1 });
    const initialSelection = {
      slug: entry.slug,
      source: entry.source,
      skillChoices: [],
      languageChoices: [],
      toolChoices: {},
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[entry]}
        initialSelection={initialSelection}
      />,
    );

    const luteBtn = screen.getByRole('button', { name: 'Lute' });
    const drumBtn = screen.getByRole('button', { name: 'Drum' });

    // Neither is disabled initially (no picks yet)
    expect(luteBtn.hasAttribute('disabled')).toBe(false);
    expect(drumBtn.hasAttribute('disabled')).toBe(false);

    // Pick lute
    fireEvent.click(luteBtn);

    // After picking 1 (count=1), the OTHER button should now be disabled
    expect(screen.getByRole('button', { name: 'Drum' }).hasAttribute('disabled')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B.4b — MultiSelectChoose is NOT rendered when toolChoose is null (Acolyte)
// ---------------------------------------------------------------------------

describe('BackgroundPicker — toolChoose block absent when null (Acolyte)', () => {
  it('does not render tool-pool MultiSelectChoose buttons for Acolyte (no toolProficiencies)', () => {
    const entry = makeAcolyteEntry();
    const initialSelection = {
      slug: entry.slug,
      source: entry.source,
      skillChoices: [],
      languageChoices: [],
      toolChoices: {},
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[entry]}
        initialSelection={initialSelection}
      />,
    );

    // Acolyte has no toolProficiencies (toolChoose === null).
    // No tool pick buttons from a MultiSelectChoose pool should be present.
    // We assert specific tool-pool items do NOT appear as interactive buttons.
    // (Acolyte has no tools at all — no fixed grants, no choose pool.)
    expect(screen.queryByRole('button', { name: 'Lute' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dice Set' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alchemists Supplies' })).toBeNull();
  });
});
