import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PendingFichasCardTrigger } from './pending-fichas-card-trigger';
import type { PendingFichaSummary, QuestSinTocar } from '../types';

const MOCK_PENDING_FICHAS: PendingFichaSummary[] = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    portraitInitial: 'M',
    pj: 'Mírelle Vaelthar',
    lineage: 'Elfa de luna · Hechicera',
    player: 'mau',
    sent: 'hace 2 horas',
    fresh: true,
  },
  {
    id: 'b1ffcd00-ad1c-4f09-bc7e-7cc0ce491b22',
    portraitInitial: 'A',
    pj: 'Arken Drûm',
    lineage: 'Enano de montaña · Clérigo',
    player: 'lu',
    sent: 'hace 3 días',
    fresh: false,
  },
];

const MOCK_PENDING_OLDEST_AGE = 'hace 3 días';

const MOCK_QUESTS_SIN_TOCAR: QuestSinTocar[] = [];

vi.mock('@/app/inicio/actions', () => ({
  approveFichaFromInicio: vi.fn(),
  rejectFichaFromInicio: vi.fn(),
}));

describe('PendingFichasCardTrigger', () => {
  it('T1: initial render does not open the sheet', () => {
    render(
      <PendingFichasCardTrigger
        fichas={MOCK_PENDING_FICHAS}
        oldestAge={MOCK_PENDING_OLDEST_AGE}
        quests={MOCK_QUESTS_SIN_TOCAR}
      />,
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('T2: clicking the card opens the sheet (role="dialog" present)', () => {
    render(
      <PendingFichasCardTrigger
        fichas={MOCK_PENDING_FICHAS}
        oldestAge={MOCK_PENDING_OLDEST_AGE}
        quests={MOCK_QUESTS_SIN_TOCAR}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /revisar/i }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('T2b: opened sheet renders title "Fichas pendientes" (PFS-SHEET-TITLE-03)', () => {
    render(
      <PendingFichasCardTrigger
        fichas={MOCK_PENDING_FICHAS}
        oldestAge={MOCK_PENDING_OLDEST_AGE}
        quests={MOCK_QUESTS_SIN_TOCAR}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /revisar/i }));
    expect(screen.getByText('Fichas pendientes')).toBeTruthy();
  });

  it('T3: pressing Escape closes the sheet', () => {
    render(
      <PendingFichasCardTrigger
        fichas={MOCK_PENDING_FICHAS}
        oldestAge={MOCK_PENDING_OLDEST_AGE}
        quests={MOCK_QUESTS_SIN_TOCAR}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /revisar/i }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
