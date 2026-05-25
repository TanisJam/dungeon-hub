/**
 * Component tests for SlotGrid + PactSlotGrid (SP-05).
 * REQ-SP05-UX-CONSUME, REQ-SP05-UX-BUBBLE-STATE.
 *
 * Rest buttons (short/long) are tested in _rest-actions.test.tsx — they live at
 * the sheet header, not in the hechizos tab.
 *
 * PHB p.201 — tapping filled bubble consumes a slot.
 * PHB p.107 — pact slot uses separate pool.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotGrid, PactSlotGrid } from './_slot-grid';

// Mock the server actions — they are async and we only want to verify they're called.
vi.mock('../actions', () => ({
  useSpellSlot: vi.fn().mockResolvedValue({ ok: true }),
}));

// Import after mock to get the mocked versions.
import * as actions from '../actions';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── SlotGrid ──────────────────────────────────────────────────────────────────

describe('SlotGrid', () => {
  it('renders correct filled/empty count: 3 max, 1 used → 2 filled + 1 empty', () => {
    render(<SlotGrid charId="abc" level={2} max={3} used={1} />);
    // filled = 3 - 1 = 2; empty = 1
    const filledButtons = screen.getAllByRole('button').filter((b) => !b.hasAttribute('disabled'));
    const disabledButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('disabled'));
    expect(filledButtons).toHaveLength(2);
    expect(disabledButtons).toHaveLength(1);
  });

  it('clicking filled bubble calls useSpellSlot with correct args (REQ-SP05-UX-CONSUME)', async () => {
    const { useSpellSlot } = await import('../actions');
    render(<SlotGrid charId="char-123" level={3} max={2} used={0} />);

    // First button is filled.
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);

    // Wait for transition.
    await vi.waitFor(() => {
      expect(useSpellSlot).toHaveBeenCalledWith('char-123', 3, 'regular');
    });
  });

  it('clicking empty bubble (used=max) does NOT call useSpellSlot (REQ-SP05-UX-BUBBLE-STATE)', async () => {
    const { useSpellSlot } = await import('../actions');
    render(<SlotGrid charId="char-123" level={1} max={2} used={2} />);

    // All buttons are disabled when used=max.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => {
      // disabled attribute present
      expect(b.getAttribute('disabled')).toBeDefined();
    });
    fireEvent.click(buttons[0]!);
    expect(useSpellSlot).not.toHaveBeenCalled();
  });
});

// ── PactSlotGrid ─────────────────────────────────────────────────────────────

describe('PactSlotGrid', () => {
  it('clicking filled pact bubble calls useSpellSlot with slotType pact', async () => {
    const { useSpellSlot } = await import('../actions');
    render(<PactSlotGrid charId="char-456" pactLevel={3} max={2} used={0} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);

    await vi.waitFor(() => {
      expect(useSpellSlot).toHaveBeenCalledWith('char-456', 3, 'pact');
    });
  });
});

