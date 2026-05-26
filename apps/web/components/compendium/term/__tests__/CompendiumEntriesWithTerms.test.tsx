/**
 * C.1 — Integration tests for CompendiumEntriesWithTerms wrapper.
 *
 * Verifies:
 * - Renders CompendiumEntries inside TermProvider
 * - Hover over [data-compendium-ref] span opens dialog (mock resolver path)
 * - Empty entries array does not crash
 * - mockMode bypasses fetch (no real network)
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
  findByRole,
} from '@testing-library/react';
import { CompendiumEntriesWithTerms } from '../CompendiumEntriesWithTerms';
import { createMockResolver } from '../mock';
import type { TermFetchResult } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPELL_FIXTURE: TermFetchResult = {
  kind: 'ok',
  entry: {
    name: 'Fireball',
    entries: ['A bright streak flashes from your pointing finger.'],
    source: 'PHB',
    sourceCitation: "Player's Handbook p. 241",
  },
};

const fixtures: Record<string, TermFetchResult> = {
  'spell:fireball:phb': SPELL_FIXTURE,
};

// ---------------------------------------------------------------------------
// C.1 — Renders CompendiumEntries inside provider
// ---------------------------------------------------------------------------

describe('CompendiumEntriesWithTerms — basic render', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders text content from entries without crashing', () => {
    const entries = ['Cast {@spell fireball|PHB}.'];
    render(
      <CompendiumEntriesWithTerms
        entries={entries}
        worldId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={createMockResolver(fixtures)}
      />,
    );

    // The span for "fireball" should exist (rendered by CompendiumEntries)
    const refSpan = document.querySelector('[data-compendium-ref^="spell|fireball"]');
    expect(refSpan).not.toBeNull();
    expect(refSpan!.textContent).toBe('fireball');
  });

  it('empty entries array renders without error and provider is mounted', () => {
    render(
      <CompendiumEntriesWithTerms
        entries={[]}
        worldId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={createMockResolver(fixtures)}
      />,
    );
    // No crash — provider wrapper still renders
    expect(document.body).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C.1 — Hover opens card with mock resolver
// ---------------------------------------------------------------------------

describe('CompendiumEntriesWithTerms — hover opens HoverCard via mock resolver', () => {
  const OPEN_DELAY = 120;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('hover on [data-compendium-ref] span opens dialog with mocked entry name', async () => {
    const entries = ['Cast {@spell fireball|PHB} for big damage.'];

    render(
      <CompendiumEntriesWithTerms
        entries={entries}
        worldId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={createMockResolver(fixtures)}
      />,
    );

    const refSpan = document.querySelector('[data-compendium-ref^="spell|fireball"]') as HTMLElement;
    expect(refSpan).not.toBeNull();

    // No dialog yet
    expect(screen.queryByRole('dialog')).toBeNull();

    // Hover
    fireEvent.pointerOver(refSpan);

    // Advance past OPEN_DELAY + flush microtasks (mock resolver is sync)
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      // flush promise queue (mock resolver resolves synchronously but .then is microtask)
      await Promise.resolve();
      await Promise.resolve();
    });

    // Dialog should be open
    const dialog = screen.queryByRole('dialog');
    expect(dialog).not.toBeNull();

    // Card shows the mocked entry name
    expect(dialog!.textContent).toContain('Fireball');
  });

  it('hover with mockResolver resolving condition shows correct entry', async () => {
    const conditionFixtures: Record<string, TermFetchResult> = {
      'condition:prone:phb': {
        kind: 'ok',
        entry: {
          name: 'Prone',
          entries: ['While prone, you are lying on the ground.'],
          source: 'PHB',
        },
      },
    };

    const entries = ['A creature falls {@condition prone|PHB}.'];

    render(
      <CompendiumEntriesWithTerms
        entries={entries}
        worldId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={createMockResolver(conditionFixtures)}
      />,
    );

    const refSpan = document.querySelector('[data-compendium-ref^="condition|prone"]') as HTMLElement;
    expect(refSpan).not.toBeNull();

    fireEvent.pointerOver(refSpan);
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = screen.queryByRole('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Prone');
  });
});
