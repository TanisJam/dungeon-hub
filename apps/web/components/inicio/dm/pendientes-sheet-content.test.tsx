import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PendientesSheetContent } from './pendientes-sheet-content';
import type { PendingFichaSummary, QuestSinTocar } from '../dm-mock-data';

vi.mock('@/app/inicio/actions', () => ({
  approveFichaFromInicio: vi.fn(),
  rejectFichaFromInicio: vi.fn(),
}));

const FICHAS: PendingFichaSummary[] = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    portraitInitial: 'M',
    pj: 'Mírelle',
    lineage: 'Elfa',
    player: 'mau',
    sent: 'hace 2 horas',
    fresh: true,
  },
  {
    id: 'b1ffcd00-ad1c-4f09-bc7e-7cc0ce491b22',
    portraitInitial: 'A',
    pj: 'Arken',
    lineage: 'Enano',
    player: 'lu',
    sent: 'hace 3 días',
    fresh: false,
  },
  {
    id: 'c2aabd11-be2d-4019-bd8f-8dd1df5a2c33',
    portraitInitial: 'R',
    pj: 'Ravenna',
    lineage: 'Humana',
    player: 'fede',
    sent: 'hace 5 días',
    fresh: false,
  },
];

const QUESTS: QuestSinTocar[] = [
  { id: 'q1', title: 'El correo perdido', lastChange: 'hace 3 días' },
  { id: 'q2', title: 'La torre del pacto', lastChange: 'hace 5 días' },
];

describe('PendientesSheetContent', () => {
  it('T1: renders "Fichas a aprobar" section head with count meta', () => {
    render(<PendientesSheetContent fichas={FICHAS} quests={QUESTS} />);
    expect(screen.getByText('Fichas a aprobar')).toBeTruthy();
    expect(screen.getByText(String(FICHAS.length))).toBeTruthy();
  });

  it('T2: renders N PendientesFichaCard instances matching fichas.length', () => {
    render(<PendientesSheetContent fichas={FICHAS} quests={QUESTS} />);
    expect(screen.getAllByRole('button', { name: /aprobar/i })).toHaveLength(FICHAS.length);
  });

  it('T3: renders "Quests pendientes" section head and quest rows', () => {
    render(<PendientesSheetContent fichas={FICHAS} quests={QUESTS} />);
    expect(screen.getByText('Quests pendientes')).toBeTruthy();
    expect(screen.getByText('El correo perdido')).toBeTruthy();
    expect(screen.getByText('La torre del pacto')).toBeTruthy();
  });
});
