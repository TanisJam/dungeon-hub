import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PendingFichasCardTrigger } from './pending-fichas-card-trigger';
import { MOCK_PENDING_FICHAS, MOCK_PENDING_OLDEST_AGE, MOCK_QUESTS_SIN_TOCAR } from '../dm-mock-data';

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
