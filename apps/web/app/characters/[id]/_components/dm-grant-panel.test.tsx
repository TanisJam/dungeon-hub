/**
 * DmGrantPanel — visibility gate, tab switching, submit flow, inline errors.
 *
 * SDD dm-session-grants (spec #867):
 *   REQ-CDG-DM-PANEL-VISIBILITY: only gm sees trigger button
 *   REQ-CDG-DM-PANEL-INTERACTION: tab switching, modal open/close
 *   REQ-CDG-XP-FORM: submit pending state, success → close, error → stays open
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../actions', () => ({
  grantXp: vi.fn().mockResolvedValue({ ok: true }),
  grantGold: vi.fn().mockResolvedValue({ ok: true }),
  grantItem: vi.fn().mockResolvedValue({ ok: true }),
  searchCompendiumItems: vi.fn().mockResolvedValue([]),
}));

import { DmGrantPanel } from './dm-grant-panel';

const PROPS = {
  characterId: 'char-1',
  worldId: 'world-1',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DmGrantPanel — REQ-CDG-DM-PANEL-VISIBILITY', () => {
  it('player → no trigger button', () => {
    const { container } = render(
      <DmGrantPanel {...PROPS} callerRole="player" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('null callerRole → no trigger button', () => {
    const { container } = render(
      <DmGrantPanel {...PROPS} callerRole={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('gm → trigger button visible with aria-label', () => {
    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    expect(
      screen.getByRole('button', { name: 'Otorgar recompensa de DM' }),
    ).toBeTruthy();
  });
});

describe('DmGrantPanel — REQ-CDG-DM-PANEL-INTERACTION', () => {
  it('click trigger → modal opens on XP tab by default', async () => {
    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otorgar recompensa de DM' }));
    });
    // dialog appears
    expect(screen.getByRole('dialog')).toBeTruthy();
    // XP tab selected
    const xpTab = screen.getByRole('tab', { name: 'XP' });
    expect(xpTab.getAttribute('aria-selected')).toBe('true');
  });

  it('click "Oro" tab → switches to gold form', async () => {
    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otorgar recompensa de DM' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Oro' }));
    });
    const oroTab = screen.getByRole('tab', { name: 'Oro' });
    expect(oroTab.getAttribute('aria-selected')).toBe('true');
    // Gold form has coin inputs
    expect(screen.getByLabelText(/Oro \(gp\)/i)).toBeTruthy();
  });

  it('click "Ítem" tab → switches to item form', async () => {
    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otorgar recompensa de DM' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Ítem' }));
    });
    const itemTab = screen.getByRole('tab', { name: 'Ítem' });
    expect(itemTab.getAttribute('aria-selected')).toBe('true');
    // Item form has search input
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('close button → modal closes', async () => {
    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otorgar recompensa de DM' }));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('DmGrantPanel — XP tab submit', () => {
  it('submit with valid award → calls grantXp, modal closes on success', async () => {
    const { grantXp } = await import('../actions');
    vi.mocked(grantXp).mockResolvedValue({ ok: true });

    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otorgar recompensa de DM' }));
    });

    const input = screen.getByLabelText(/XP a otorgar/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: '100' } });
    });
    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });

    await vi.waitFor(() => {
      expect(grantXp).toHaveBeenCalledWith('char-1', 100);
    });
    // Modal closes on success
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('submit with grantXp returning error → inline error shown, modal stays open', async () => {
    const { grantXp } = await import('../actions');
    vi.mocked(grantXp).mockResolvedValue({ ok: false, error: 'XP no puede ser negativo.' });

    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otorgar recompensa de DM' }));
    });

    const input = screen.getByLabelText(/XP a otorgar/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: '-9999' } });
    });
    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toContain('XP no puede ser negativo.');
    });
    // Modal stays open
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('DmGrantPanel — tap targets (mobile-first)', () => {
  it('trigger button has min-h-[44px]', () => {
    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    const btn = screen.getByRole('button', { name: 'Otorgar recompensa de DM' });
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('all tab buttons have min-h-[44px]', async () => {
    render(<DmGrantPanel {...PROPS} callerRole="gm" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otorgar recompensa de DM' }));
    });
    const tabs = screen.getAllByRole('tab');
    for (const tab of tabs) {
      expect(tab.className).toContain('min-h-[44px]');
    }
  });
});
