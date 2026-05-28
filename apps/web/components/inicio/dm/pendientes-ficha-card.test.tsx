import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PendientesFichaCard } from './pendientes-ficha-card';
import type { PendingFichaSummary } from '../dm-mock-data';

vi.mock('@/app/inicio/actions', () => ({
  approveFichaFromInicio: vi.fn(),
  rejectFichaFromInicio: vi.fn(),
}));

const BASE_FICHA: PendingFichaSummary = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  portraitInitial: 'L',
  pj: 'Lyra',
  lineage: 'Elfa',
  player: 'mau',
  sent: 'hace 3 días',
  fresh: true,
};

describe('PendientesFichaCard', () => {
  it('T1: renders PJ, lineage, player, sent, and action labels', () => {
    render(<PendientesFichaCard ficha={BASE_FICHA} />);
    expect(screen.getByText('Lyra')).toBeTruthy();
    expect(screen.getByText('Elfa')).toBeTruthy();
    expect(screen.getByText('mau')).toBeTruthy();
    expect(screen.getByText(/hace 3 días/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ver ficha/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /devolver/i })).toBeTruthy();
  });

  it('T2: fresh=true → root has .pendientes-card-fresh', () => {
    const { container } = render(<PendientesFichaCard ficha={BASE_FICHA} />);
    expect(container.querySelector('.pendientes-card-fresh')).not.toBeNull();
  });

  it('T3: fresh=false → root does NOT have .pendientes-card-fresh', () => {
    const { container } = render(
      <PendientesFichaCard ficha={{ ...BASE_FICHA, fresh: false }} />,
    );
    expect(container.querySelector('.pendientes-card-fresh')).toBeNull();
  });

  it('T4: portrait element has class .pendientes-portrait', () => {
    const { container } = render(<PendientesFichaCard ficha={BASE_FICHA} />);
    expect(container.querySelector('.pendientes-portrait')).not.toBeNull();
  });
});
