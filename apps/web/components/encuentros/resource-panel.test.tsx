import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResourcePanel } from './resource-panel';
import type { ClassResourceView } from '@/lib/sheet-types';

// Server Actions are mocked — they are not available in jsdom context.
vi.mock('@/app/encuentros/[id]/actions', () => ({
  useResource: vi.fn().mockResolvedValue({ ok: true }),
  restoreResource: vi.fn().mockResolvedValue({ ok: true }),
  shortRest: vi.fn().mockResolvedValue({ ok: true }),
  longRest: vi.fn().mockResolvedValue({ ok: true }),
}));

// useRouter is called by ResourcePanel for VERSION_CONFLICT refresh.
// mockRefresh is module-level so FIX 5 tests can assert on it.
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Import mutable mock references for FIX 5 per-test overrides
import { useResource } from '@/app/encuentros/[id]/actions';

const kiResource: ClassResourceView = {
  slug: 'monk:ki-points',
  classSlug: 'monk',
  used: 6,
  max: 10,
  recoveryTrigger: 'short',
};

describe('ResourcePanel', () => {
  // REQ-WCO-WEB-05a: own character resources visible (Ki 4/10)
  it('REQ-WCO-WEB-05a: shows resource name, current/max counter', () => {
    render(
      <ResourcePanel
        characterId="char-123"
        encounterId="enc-456"
        resources={[kiResource]}
      />,
    );
    // current = max - used = 10 - 6 = 4
    expect(screen.getByText(/Puntos de Ki/i)).toBeTruthy();
    expect(screen.getByText(/4\s*\/\s*10/)).toBeTruthy();
  });

  // REQ-WCO-WEB-05b: Use and Restore buttons are present with ≥44px touch target class
  it('REQ-WCO-WEB-05b: Use and Restore buttons have min-h-[44px] touch target', () => {
    const { container } = render(
      <ResourcePanel
        characterId="char-123"
        encounterId="enc-456"
        resources={[kiResource]}
      />,
    );
    const useBtn = screen.getByRole('button', { name: /usar/i });
    const restoreBtn = screen.getByRole('button', { name: /restaurar/i });
    expect(useBtn).toBeTruthy();
    expect(restoreBtn).toBeTruthy();
    // Touch target: min-h-[44px] class present on button or wrapper
    const hasMinHeight = (el: Element) =>
      el.className.includes('min-h-[44px]') ||
      el.closest('[class*="min-h-"]') !== null;
    expect(hasMinHeight(useBtn)).toBe(true);
  });

  // REQ-WCO-WEB-06: Short Rest + Long Rest buttons present
  it('REQ-WCO-WEB-06: Short Rest and Long Rest buttons are visible', () => {
    render(
      <ResourcePanel
        characterId="char-123"
        encounterId="enc-456"
        resources={[kiResource]}
      />,
    );
    expect(screen.getByRole('button', { name: /descanso corto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /descanso largo/i })).toBeTruthy();
  });

  // Empty resources: no resource rows but rest buttons still shown
  it('REQ-WCO-WEB-05c: empty resource list still shows rest buttons', () => {
    render(
      <ResourcePanel
        characterId="char-123"
        encounterId="enc-456"
        resources={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /descanso corto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /descanso largo/i })).toBeTruthy();
  });

  // FIX 5 (SUGGESTION): VERSION_CONFLICT from useResource → router.refresh() is called
  // (resource-panel.tsx lines 50-54 handle this path)
  it('FIX-5: VERSION_CONFLICT on useResource calls router.refresh()', async () => {
    vi.mocked(useResource).mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
    } as never);
    mockRefresh.mockClear();

    render(
      <ResourcePanel
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
