/**
 * Component test: ContributionComposer — "＋ Agregar nota" affordance
 *
 * codex-knowledge B-2 (SDD tasks #1950, spec #1947, design #1948):
 *   REQ-CK-NOTE-02: "Add note" button visible + thumb-reachable (375px).
 *   REQ-CK-NOTE-02: tapping opens bottom-sheet composer (autofocus textarea + submit).
 *   REQ-CK-NOTE-02: submitting calls Server Action, creates row with visibility=personal.
 *   REQ-CK-NOTE-03: affordance only on known entities (always-visible when rendered here;
 *                   caller/parent is responsible for showing only to known entities).
 *   REQ-CK-GC-03: no edit or delete affordance (append-only invariant).
 *
 * Tests:
 *   1. "＋ Agregar nota" button renders and is visible.
 *   2. Tapping button opens the sheet (textarea becomes visible).
 *   3. Submitting calls createContribution Server Action with correct args.
 *   4. After successful submit, sheet closes.
 *   5. No edit or delete buttons present (append-only).
 *
 * Design intent: FORK 4 (#1944). This arc encodes NO PHB rule.
 * Mobile-first: 375px tap target (min-h-[44px]).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContributionComposer } from './contribution-composer';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the Server Action
vi.mock('@/app/codex/actions', () => ({
  createContribution: vi.fn(),
}));

// Mock V3Sheet — no portal complexity in tests
vi.mock('@/components/ui', () => ({
  V3Sheet: ({ children, open, title, onClose }: { children: React.ReactNode; open: boolean; title: string; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        <button type="button" onClick={onClose}>Cerrar</button>
      </div>
    ) : null,
}));

import { createContribution } from '@/app/codex/actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const DEFAULT_PROPS = {
  worldId: 'world-test',
  refEntityKind: 'bestiary',
  refEntityId: 'goblin',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContributionComposer (B-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REQ-CK-NOTE-02: "＋ Agregar nota" button renders', () => {
    render(<ContributionComposer {...DEFAULT_PROPS} />);
    const btn = screen.getByRole('button', { name: /agregar nota/i });
    expect(btn).toBeTruthy();
  });

  it('REQ-CK-NOTE-02: button opens bottom-sheet composer on click', async () => {
    render(<ContributionComposer {...DEFAULT_PROPS} />);

    // Sheet is closed initially
    expect(screen.queryByRole('dialog')).toBeNull();

    // Tap to open
    const btn = screen.getByRole('button', { name: /agregar nota/i });
    fireEvent.click(btn);

    // Sheet opens with textarea
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    const textarea = screen.getByPlaceholderText(/escribí tu nota/i);
    expect(textarea).toBeTruthy();
  });

  it('REQ-CK-NOTE-02: submitting with body calls createContribution with visibility=personal', async () => {
    vi.mocked(createContribution).mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'c-1', worldId: 'world-test', authorUserId: 'user-1',
        contributionType: 'nota', body: 'test', refEntityKind: 'bestiary',
        refEntityId: 'goblin', sealedStatus: null, visibility: 'personal',
        occurredAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      },
    });

    render(<ContributionComposer {...DEFAULT_PROPS} />);

    // Open sheet
    fireEvent.click(screen.getByRole('button', { name: /agregar nota/i }));

    // Fill in body
    const textarea = screen.getByPlaceholderText(/escribí tu nota/i);
    fireEvent.change(textarea, { target: { value: 'Encontré un goblin en la cueva.' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /guardar nota/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createContribution).toHaveBeenCalledWith({
        worldId: 'world-test',
        body: 'Encontré un goblin en la cueva.',
        contributionType: 'nota',
        refEntityKind: 'bestiary',
        refEntityId: 'goblin',
        visibility: 'personal',
      });
    });
  });

  it('REQ-CK-NOTE-02: sheet closes after successful submit', async () => {
    vi.mocked(createContribution).mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'c-1', worldId: 'world-test', authorUserId: 'user-1',
        contributionType: 'nota', body: 'test', refEntityKind: 'bestiary',
        refEntityId: 'goblin', sealedStatus: null, visibility: 'personal',
        occurredAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      },
    });

    render(<ContributionComposer {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /agregar nota/i }));

    const textarea = screen.getByPlaceholderText(/escribí tu nota/i);
    fireEvent.change(textarea, { target: { value: 'Una nota.' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar nota/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('REQ-CK-GC-03: no edit or delete buttons (append-only invariant)', () => {
    render(<ContributionComposer {...DEFAULT_PROPS} />);
    // Open sheet
    fireEvent.click(screen.getByRole('button', { name: /agregar nota/i }));

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /borrar/i })).toBeNull();
  });
});
