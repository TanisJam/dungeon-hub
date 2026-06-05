/**
 * Tests for ResourcePanelIsland — container layer.
 * REQ-WCO-WEB-05, REQ-WCO-WEB-06, REQ-WCO-WEB-07
 *
 * Covers: SA wiring (useResource/restoreResource/shortRest/longRest),
 * VERSION_CONFLICT → router.refresh(), and the island renders resource rows + rest buttons.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResourcePanelIsland } from './resource-panel-island';
import type { ClassResourceView } from '@/lib/sheet-types';

// Server Actions are mocked — they are not available in jsdom context.
vi.mock('@/app/encuentros/[id]/actions', () => ({
  useResource: vi.fn().mockResolvedValue({ ok: true }),
  restoreResource: vi.fn().mockResolvedValue({ ok: true }),
  shortRest: vi.fn().mockResolvedValue({ ok: true }),
  longRest: vi.fn().mockResolvedValue({ ok: true }),
}));

// useRouter is called by ResourcePanelIsland for VERSION_CONFLICT refresh.
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { useResource } from '@/app/encuentros/[id]/actions';

const kiResource: ClassResourceView = {
  slug: 'monk:ki-points',
  classSlug: 'monk',
  used: 6,
  max: 10,
  recoveryTrigger: 'short',
};

describe('ResourcePanelIsland — container', () => {
  beforeEach(() => vi.clearAllMocks());

  // Island renders resource rows and rest buttons
  it('REQ-WCO-WEB-05a: shows resource name, current/max counter', () => {
    render(
      <ResourcePanelIsland
        characterId="char-123"
        encounterId="enc-456"
        resources={[kiResource]}
      />,
    );
    expect(screen.getByText(/Puntos de Ki/i)).toBeTruthy();
    expect(screen.getByText(/4\s*\/\s*10/)).toBeTruthy();
  });

  it('REQ-WCO-WEB-06: Short Rest and Long Rest buttons are visible', () => {
    render(
      <ResourcePanelIsland
        characterId="char-123"
        encounterId="enc-456"
        resources={[kiResource]}
      />,
    );
    expect(screen.getByRole('button', { name: /descanso corto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /descanso largo/i })).toBeTruthy();
  });

  it('REQ-WCO-WEB-05c: empty resource list still shows rest buttons', () => {
    render(
      <ResourcePanelIsland
        characterId="char-123"
        encounterId="enc-456"
        resources={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /descanso corto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /descanso largo/i })).toBeTruthy();
  });

  // FIX 5 (SUGGESTION): VERSION_CONFLICT from useResource → router.refresh() is called
  it('FIX-5: VERSION_CONFLICT on useResource calls router.refresh()', async () => {
    vi.mocked(useResource).mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
    } as never);
    mockRefresh.mockClear();

    render(
      <ResourcePanelIsland
        characterId="char-123"
        encounterId="enc-456"
        resources={[kiResource]}
      />,
    );

    const useBtn = screen.getByRole('button', { name: /usar/i });
    fireEvent.click(useBtn);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
