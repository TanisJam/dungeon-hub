/**
 * a11y tests for the term hover system.
 *
 * B.3 — tabIndex on supported-kind spans, role=dialog on open card, Escape dismisses.
 * B.6 — No raw color utilities (bg-gray-, text-blue-, etc.) in HoverCard className output.
 * TERM-A11Y — keyboard-open path: focusin on a tabIndex=0 span opens the HoverCard.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { SUPPORTED_KINDS } from '../registry';

// ---------------------------------------------------------------------------
// B.3 — tabIndex on reference spans (reference.tsx behaviour)
// ---------------------------------------------------------------------------

describe('reference.tsx — tabIndex on supported kinds', () => {
  it('supported kind (spell) span has tabIndex="0"', async () => {
    // Import lazily so it picks up file changes during TDD cycle
    const { CompendiumEntries } = await import('@/components/compendium');

    const entries = ['{@spell fireball}'];
    render(<CompendiumEntries entries={entries} />);

    const span = document.querySelector('[data-compendium-ref^="spell|"]');
    expect(span).not.toBeNull();
    expect((span as HTMLElement).tabIndex).toBe(0);
  });

  it('unsupported kind (variantrule) span has no tabIndex=0', async () => {
    const { CompendiumEntries } = await import('@/components/compendium');

    const entries = ['{@variantrule encumbrance}'];
    render(<CompendiumEntries entries={entries} />);

    const span = document.querySelector('[data-compendium-ref^="variantrule|"]');
    expect(span).not.toBeNull();
    // tabIndex should be -1 (browser default for non-interactive elements) or not 0
    expect((span as HTMLElement).tabIndex).not.toBe(0);
  });

  it('all SUPPORTED_KINDS are in the registry set', () => {
    // Smoke: the set should have exactly 11 kinds
    expect(SUPPORTED_KINDS.size).toBe(11);
    expect(SUPPORTED_KINDS.has('spell')).toBe(true);
    expect(SUPPORTED_KINDS.has('creature')).toBe(true);
    expect(SUPPORTED_KINDS.has('condition')).toBe(true);
    // Non-supported kinds must NOT be in the set
    expect(SUPPORTED_KINDS.has('variantrule')).toBe(false);
    expect(SUPPORTED_KINDS.has('classFeature')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B.3 — TermProvider: open card has role="dialog", Escape dismisses
// ---------------------------------------------------------------------------

describe('TermProvider + Term — a11y: role=dialog and Escape dismiss', () => {
  const OPEN_DELAY = 120;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('open HoverCard has role="dialog"', async () => {
    const { TermProvider } = await import('../TermProvider');

    const mockResolver = vi.fn().mockResolvedValue({
      kind: 'ok',
      entry: { name: 'Fireball', entries: ['Boom'], source: 'PHB' },
    });

    render(
      <TermProvider
        campaignId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref">fireball</span>
      </TermProvider>,
    );

    fireEvent.pointerOver(screen.getByTestId('ref'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toBeNull();
  });

  it('pressing Escape closes the open card', async () => {
    const { TermProvider } = await import('../TermProvider');

    const mockResolver = vi.fn().mockResolvedValue({
      kind: 'ok',
      entry: { name: 'Fireball', entries: [], source: 'PHB' },
    });

    render(
      <TermProvider
        campaignId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref">fireball</span>
      </TermProvider>,
    );

    // Open card
    fireEvent.pointerOver(screen.getByTestId('ref'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog')).not.toBeNull();

    // Dismiss
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TERM-A11Y — keyboard-open path: focusin opens HoverCard instantly (no delay)
// ---------------------------------------------------------------------------

describe('TermProvider — keyboard-open via focusin (tabIndex=0 span)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('opens HoverCard dialog immediately when a tabIndex=0 ref span receives focus', async () => {
    const { TermProvider } = await import('../TermProvider');

    const mockResolver = vi.fn().mockResolvedValue({
      kind: 'ok',
      entry: { name: 'Fireball', entries: ['Boom'], source: 'PHB' },
    });

    render(
      <TermProvider
        campaignId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span
          data-compendium-ref="spell|fireball|PHB"
          data-testid="ref"
          tabIndex={0}
        >
          fireball
        </span>
      </TermProvider>,
    );

    // Fire focusin — this is what the browser emits when a child receives focus.
    // fireEvent.focus dispatches "focus" but NOT "focusin" (which bubbles).
    // Use fireEvent.focusIn so the delegated focusin listener on the container fires.
    fireEvent.focusIn(screen.getByTestId('ref'));

    // focusin handler is instant (no timer) — but the mock resolver is async.
    // Flush the microtask queue so the resolved promise updates state.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B.6 — No raw color utilities in HoverCard rendered output
// ---------------------------------------------------------------------------

describe('TermCard — no raw Tailwind color utilities in className', () => {
  const OPEN_DELAY = 120;
  // Raw color regex matching the grep gate pattern
  const RAW_COLOR_RE =
    /\b(bg|text|border|ring)-(zinc|gray|slate|red|blue|green|yellow|purple|pink|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|fuchsia|rose|stone|neutral)-\d+/;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('TermCard rendered content has no raw Tailwind color classes', async () => {
    const { TermProvider } = await import('../TermProvider');

    const mockResolver = vi.fn().mockResolvedValue({
      kind: 'ok',
      entry: {
        name: 'Fireball',
        entries: ['A bright streak.'],
        source: 'PHB',
        sourceCitation: "Player's Handbook p. 241",
      },
    });

    const { container } = render(
      <TermProvider
        campaignId="c1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref">fireball</span>
      </TermProvider>,
    );

    fireEvent.pointerOver(screen.getByTestId('ref'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    // Collect all className strings in the rendered tree
    const allElements = container.querySelectorAll('[class]');
    const allClasses = Array.from(allElements)
      .map((el) => el.getAttribute('class') ?? '')
      .join(' ');

    expect(allClasses).not.toMatch(RAW_COLOR_RE);
  });
});
