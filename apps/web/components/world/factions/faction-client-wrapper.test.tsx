/**
 * FactionClientWrapper component tests.
 * REQ-FAC-01, REQ-GATE-01, REQ-GATE-04.
 *
 * Tests:
 *   (a) DM view: FAB present, edit/delete present in sheet, dmNotes present.
 *   (b) Player view: FAB absent, edit/delete absent from sheet, dmNotes absent.
 *
 * NOTE: afterEach(cleanup) is NOT declared here — it is already global via
 * apps/web/vitest.setup.ts. REQ-GATE-04.
 *
 * Mocking strategy: Server Actions (listFactions, getFactionDetail, createFaction,
 * updateFaction, deleteFaction) are mocked via vi.mock. The test renders
 * FactionClientWrapper with controlled props and asserts DOM presence/absence.
 *
 * V3Sheet uses createPortal which needs document.body as baseElement.
 * Assertion style: uses .toBeTruthy() / .toBeNull() (no @testing-library/jest-dom installed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FactionClientWrapper } from './faction-client-wrapper';
import type { FactionRow } from '@/app/herramientas/actions';

// WorldEntityShell calls useRouter().refresh() after mutations — mock it (no app-router in jsdom).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// ─── Mock Server Actions ─────────────────────────────────────────────────────

vi.mock('@/app/herramientas/actions', () => ({
  listFactions: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getFactionDetail: vi.fn().mockResolvedValue({
    id: 'f-1',
    worldId: 'w-1',
    name: 'Los Cazadores',
    state: 'active' as const,
    description: 'Una facción de cazadores.',
    dmNotes: 'Secreto del DM: traicionan al grupo.',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  } satisfies FactionRow),
  createFaction: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  updateFaction: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  deleteFaction: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

// ─── Test data ───────────────────────────────────────────────────────────────

const mockFaction: FactionRow = {
  id: 'f-1',
  worldId: 'w-1',
  name: 'Los Cazadores',
  state: 'active',
  description: 'Una facción de cazadores.',
  dmNotes: 'Secreto del DM: traicionan al grupo.',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderWrapper(effectiveView: 'dm' | 'player', factions: FactionRow[] = [mockFaction]) {
  return render(
    <FactionClientWrapper
      worldId="w-1"
      effectiveView={effectiveView}
      initialFactions={factions}
    />,
    { baseElement: document.body },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FactionClientWrapper — DM view (effectiveView="dm")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) FAB "Crear" is present in DM view', () => {
    renderWrapper('dm');
    // FAB renders when effectiveView === 'dm' — REQ-GATE-01
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeTruthy();
  });

  it('(a) edit button is present in detail sheet when DM taps a row', async () => {
    renderWrapper('dm');

    // Tap the faction row to open detail sheet
    const rowButton = screen.getByRole('button', { name: /Los Cazadores/i });
    fireEvent.click(rowButton);

    // Wait for detail to load (getFactionDetail mock resolves)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /editar/i })).toBeTruthy();
    });
  });

  it('(a) delete button is present in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Los Cazadores/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /eliminar/i })).toBeTruthy();
    });
  });

  it('(a) dmNotes are visible in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Los Cazadores/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Secreto del DM: traicionan al grupo.')).toBeTruthy();
    });
  });
});

// ─── Injected actions path ───────────────────────────────────────────────────

describe('FactionClientWrapper — injected actions (DI path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with stub actions bundle: getFactionDetail stub is called on row tap, real module is NOT called', async () => {
    const stubFaction: FactionRow = {
      id: 'f-stub',
      worldId: 'w-stub',
      name: 'Los Cazadores',
      state: 'active',
      description: 'Una facción de cazadores.',
      dmNotes: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const stubListFactions = vi.fn().mockResolvedValue({ rows: [stubFaction], total: 1 });
    const stubGetFactionDetail = vi.fn().mockResolvedValue(stubFaction);
    const stubCreateFaction = vi.fn().mockResolvedValue({ ok: true, data: stubFaction });
    const stubUpdateFaction = vi.fn().mockResolvedValue({ ok: true, data: stubFaction });
    const stubDeleteFaction = vi.fn().mockResolvedValue({ ok: true, data: undefined });

    render(
      <FactionClientWrapper
        worldId="w-stub"
        effectiveView="dm"
        initialFactions={[stubFaction]}
        actions={{
          listFactions: stubListFactions,
          getFactionDetail: stubGetFactionDetail,
          createFaction: stubCreateFaction,
          updateFaction: stubUpdateFaction,
          deleteFaction: stubDeleteFaction,
        }}
      />,
      { baseElement: document.body },
    );

    const rowButton = screen.getByRole('button', { name: /Los Cazadores/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(stubGetFactionDetail).toHaveBeenCalledWith('f-stub');
    });

    // listFactions is not called on mount (only via onSearch debounce) — stub not invoked yet
    expect(stubListFactions).not.toHaveBeenCalled();
  });
});

describe('FactionClientWrapper — Player view (effectiveView="player")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(b) FAB "Crear" is NOT present in player view — REQ-GATE-01 absence', () => {
    renderWrapper('player');
    // Must be absent — not just disabled (REQ-GATE-01)
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeNull();
  });

  it('(b) edit button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Los Cazadores/i });
    fireEvent.click(rowButton);

    // Wait for detail sheet to load
    await waitFor(() => {
      expect(screen.queryByText('Los Cazadores')).toBeTruthy();
    });

    // Edit must be absent — REQ-GATE-01
    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull();
  });

  it('(b) delete button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Los Cazadores/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Los Cazadores')).toBeTruthy();
    });

    // Delete must be absent — REQ-GATE-01
    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull();
  });

  it('(b) dmNotes are NOT present in detail sheet for player view — REQ-GATE-01 absence', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Los Cazadores/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Los Cazadores')).toBeTruthy();
    });

    // dmNotes text must be absent from DOM entirely (not just hidden)
    expect(
      screen.queryByText('Secreto del DM: traicionan al grupo.'),
    ).toBeNull();
  });
});
