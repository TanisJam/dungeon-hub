/**
 * Component tests for /tablero — Tablero de anuncios (player-facing board).
 *
 * Mirrors the mock pattern from app/worlds/[id]/page.test.tsx: AppShell is
 * mocked as a passthrough (its TabBar/DesktopSidebar children are client
 * components using usePathname, which don't need to be exercised here).
 *
 * Scenarios:
 * - no active character → empty state
 * - active character but no available/active quests → empty state
 * - active character with quests → renders QuestRow list, filtered/ordered
 *   per selectBoardQuests (unit-tested separately in
 *   ./_select-board-quests.test.ts)
 */

import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: { access_token: 'tok' } } }),
        ),
      },
    }),
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

const mockGetActiveCharacter = vi.fn();
vi.mock('@/lib/active-character', () => ({
  getActiveCharacter: (...args: unknown[]) => mockGetActiveCharacter(...args),
}));

const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({
    children,
    title,
    subtitle,
  }: {
    children: React.ReactNode;
    title: string;
    subtitle?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));

import TableroPage from './page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORLD_ID = 'world-1';

function activeCharacter() {
  return {
    id: 'char-1',
    name: 'Aria',
    worldId: WORLD_ID,
    status: 'active',
    lineage: 'human',
    hpCurrent: 10,
    hpMax: 10,
  };
}

async function renderPage() {
  const ui = await TableroPage();
  render(ui as React.ReactElement);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TableroPage', () => {
  it('T1: no active character → renders the "select a character" empty state', async () => {
    mockGetActiveCharacter.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByText(/Seleccioná un personaje para ver el Tablero/i)).toBeTruthy();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('T2: active character but no available/active quests → renders the empty state', async () => {
    mockGetActiveCharacter.mockResolvedValue(activeCharacter());
    mockApiGet.mockResolvedValue({
      data: [
        { id: 'q1', title: 'Vieja gesta', description: null, status: 'completed', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'q2', title: 'Misión abandonada', description: null, status: 'abandoned', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });

    await renderPage();

    expect(mockApiGet).toHaveBeenCalledWith(`/worlds/${WORLD_ID}/quests`, 'tok');
    expect(screen.getByText(/No hay convocatorias disponibles en este mundo/i)).toBeTruthy();
  });

  it('T3: api fetch failure → degrades to the empty state instead of throwing', async () => {
    mockGetActiveCharacter.mockResolvedValue(activeCharacter());
    mockApiGet.mockRejectedValue(new Error('network down'));

    await renderPage();

    expect(screen.getByText(/No hay convocatorias disponibles en este mundo/i)).toBeTruthy();
  });

  it('T4: renders only available/active quests, available first, both labeled in Spanish', async () => {
    mockGetActiveCharacter.mockResolvedValue(activeCharacter());
    mockApiGet.mockResolvedValue({
      data: [
        {
          id: 'q-active',
          title: 'La torre asediada',
          description: 'Rechazar a los invasores',
          status: 'active',
          updatedAt: '2026-01-05T00:00:00.000Z',
        },
        {
          id: 'q-completed',
          title: 'Cerrada hace tiempo',
          description: null,
          status: 'completed',
          updatedAt: '2026-01-06T00:00:00.000Z',
        },
        {
          id: 'q-available',
          title: 'El correo perdido',
          description: 'Entregar el paquete al posadero',
          status: 'available',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    await renderPage();

    expect(screen.getByText('La torre asediada')).toBeTruthy();
    expect(screen.getByText('El correo perdido')).toBeTruthy();
    expect(screen.queryByText('Cerrada hace tiempo')).toBeNull();

    // Ordering: available quests render before active quests (REQ from brief).
    const titles = screen.getAllByText(/La torre asediada|El correo perdido/).map((el) => el.textContent);
    expect(titles).toEqual(['El correo perdido', 'La torre asediada']);

    expect(screen.getByText(/Disponible/)).toBeTruthy();
    expect(screen.getByText(/En curso/)).toBeTruthy();
  });
});
