/**
 * TermProvider state machine tests.
 * Tests event delegation, fetch dedup, auth guard, and keyboard dismissal.
 *
 * Uses fake timers to advance open/close delays without real waits.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { TermProvider } from '../TermProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpan(kind: string, slug: string, source = 'PHB'): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('data-compendium-ref', `${kind}|${slug}|${source}`);
  return span;
}

function makeMockResolver(result: { kind: 'ok' | 'error'; entry?: object; message?: string }) {
  return vi.fn().mockResolvedValue(result);
}

const OPEN_DELAY = 120; // ms — matches TermProvider default

// ---------------------------------------------------------------------------
// B.1 — State machine: hover opens card after OPEN_DELAY
// ---------------------------------------------------------------------------

describe('TermProvider — hover opens card after OPEN_DELAY', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('opens HoverCard dialog after OPEN_DELAY when pointer enters a supported ref', async () => {
    const mockResolver = makeMockResolver({
      kind: 'ok',
      entry: { name: 'Fireball', entries: ['A bright streak...'], source: 'PHB' },
    });

    render(
      <TermProvider
        worldId="campaign-1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span
          data-compendium-ref="spell|fireball|PHB"
          data-testid="ref-span"
        >
          fireball
        </span>
      </TermProvider>,
    );

    const refSpan = screen.getByTestId('ref-span');

    // Pointer enters the span
    fireEvent.pointerOver(refSpan);

    // Card should NOT be open yet (delay not elapsed)
    expect(screen.queryByRole('dialog')).toBeNull();

    // Advance past OPEN_DELAY
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
    });

    // Wait for the mock resolver promise to settle
    await act(async () => {
      await Promise.resolve();
    });

    // Card should now be visible
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('does NOT open if pointer leaves before OPEN_DELAY elapses', async () => {
    const mockResolver = makeMockResolver({
      kind: 'ok',
      entry: { name: 'Fireball', entries: [], source: 'PHB' },
    });

    render(
      <TermProvider
        worldId="campaign-1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref-span">
          fireball
        </span>
      </TermProvider>,
    );

    const refSpan = screen.getByTestId('ref-span');
    fireEvent.pointerOver(refSpan);

    // Leave before delay fires
    fireEvent.pointerOut(refSpan);
    vi.advanceTimersByTime(OPEN_DELAY + 10);

    await act(async () => { await Promise.resolve(); });

    // Card should remain closed
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B.1 — Fetch dedup: same key → single call
// ---------------------------------------------------------------------------

describe('TermProvider — fetch dedup for same refKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('calls the resolver exactly once when two spans share the same refKey', async () => {
    const mockResolver = makeMockResolver({
      kind: 'ok',
      entry: { name: 'Fireball', entries: [], source: 'PHB' },
    });

    render(
      <TermProvider
        worldId="campaign-1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref-a">fireball</span>
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref-b">fireball</span>
      </TermProvider>,
    );

    // Hover first span
    fireEvent.pointerOver(screen.getByTestId('ref-a'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    // Close by moving away
    fireEvent.pointerOut(screen.getByTestId('ref-a'));
    await act(async () => {
      vi.advanceTimersByTime(400); // past CLOSE_DELAY
      await Promise.resolve();
    });

    // Hover second span (same refKey) — should reuse cache
    fireEvent.pointerOver(screen.getByTestId('ref-b'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    // Resolver called exactly once (cache hit on second hover)
    expect(mockResolver).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// B.1 — Missing accessToken → inert (no fetch, no card)
// ---------------------------------------------------------------------------

describe('TermProvider — missing accessToken makes all refs inert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does not fetch and does not open card when accessToken is absent', async () => {
    const mockResolver = vi.fn();

    render(
      <TermProvider
        worldId="campaign-1"
        accessToken={undefined}
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref-span">
          fireball
        </span>
      </TermProvider>,
    );

    const refSpan = screen.getByTestId('ref-span');
    fireEvent.pointerOver(refSpan);

    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    expect(mockResolver).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not fetch and does not open card when accessToken is empty string', async () => {
    const mockResolver = vi.fn();

    render(
      <TermProvider
        worldId="campaign-1"
        accessToken=""
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref-span">
          fireball
        </span>
      </TermProvider>,
    );

    fireEvent.pointerOver(screen.getByTestId('ref-span'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    expect(mockResolver).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TERM-FETCH — unsupported-kind guard: resolver not called, no dialog
// ---------------------------------------------------------------------------

describe('TermProvider — unsupported kind is ignored (no fetch, no card)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does NOT call resolver and does NOT open card for variantrule kind', async () => {
    const mockResolver = vi.fn();

    render(
      <TermProvider
        worldId="campaign-1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="variantrule|something|PHB" data-testid="ref-span">
          something
        </span>
      </TermProvider>,
    );

    fireEvent.pointerOver(screen.getByTestId('ref-span'));

    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    expect(mockResolver).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B.1 — Escape key closes open card
// ---------------------------------------------------------------------------

describe('TermProvider — Escape dismisses open HoverCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('closes the open card immediately when Escape is pressed', async () => {
    const mockResolver = makeMockResolver({
      kind: 'ok',
      entry: { name: 'Fireball', entries: [], source: 'PHB' },
    });

    render(
      <TermProvider
        worldId="campaign-1"
        accessToken="tok"
        apiBaseUrl="http://api.test"
        mockMode={mockResolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref-span">
          fireball
        </span>
      </TermProvider>,
    );

    // Open the card
    fireEvent.pointerOver(screen.getByTestId('ref-span'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog')).not.toBeNull();

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    // Card should close immediately
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
