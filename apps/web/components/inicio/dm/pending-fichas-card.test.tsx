
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PendingFichasCard } from './pending-fichas-card';
import type { PendingFichaSummary } from '../types';

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
  {
    id: 'c2aabd11-be2d-4019-bd8f-8dd1df5a2c33',
    portraitInitial: 'R',
    pj: 'Ravenna Solé',
    lineage: 'Humana · Pícara',
    player: 'fede',
    sent: 'hace 5 días',
    fresh: false,
  },
];

const MOCK_PENDING_OLDEST_AGE = 'hace 1 semana';

describe('PendingFichasCard', () => {
  it('T1: renders eyebrow, title, sub and CTA text', () => {
    const { container } = render(
      <PendingFichasCard fichas={MOCK_PENDING_FICHAS} oldestAge={MOCK_PENDING_OLDEST_AGE} onClick={() => {}} />,
    );
    expect(container.textContent).toContain('Necesitan tu mirada');
    expect(container.textContent).toContain('3 fichas pendientes');
    expect(container.textContent).toContain('Más antigua: hace 1 semana');
    expect(container.textContent).toContain('Revisar');
  });

  it('T2: root element has class inicio-pending-bg', () => {
    const { container } = render(
      <PendingFichasCard fichas={MOCK_PENDING_FICHAS} oldestAge={MOCK_PENDING_OLDEST_AGE} onClick={() => {}} />,
    );
    expect(container.querySelector('.inicio-pending-bg')).toBeTruthy();
  });

  it('T3: renders 3 avatar stack elements with class inicio-pending-stack-av', () => {
    const { container } = render(
      <PendingFichasCard fichas={MOCK_PENDING_FICHAS} oldestAge={MOCK_PENDING_OLDEST_AGE} onClick={() => {}} />,
    );
    expect(container.querySelectorAll('.inicio-pending-stack-av').length).toBe(3);
  });

  it('T4: root is a <button> without aria-disabled, and click fires onClick', () => {
    const onClick = vi.fn();
    const { container } = render(
      <PendingFichasCard fichas={MOCK_PENDING_FICHAS} oldestAge={MOCK_PENDING_OLDEST_AGE} onClick={onClick} />,
    );
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect(button!.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('T5: renders nothing (null) when fichas is empty (REQ-UXP1-PENDING-01)', () => {
    render(<PendingFichasCard fichas={[]} oldestAge={MOCK_PENDING_OLDEST_AGE} onClick={() => {}} />);
    expect(screen.queryByText('Revisar')).toBeNull();
  });

  it('T6: regression — renders CTA and count with the 3-item fixture', () => {
    render(
      <PendingFichasCard fichas={MOCK_PENDING_FICHAS} oldestAge={MOCK_PENDING_OLDEST_AGE} onClick={() => {}} />,
    );
    expect(screen.getByText('Revisar')).toBeTruthy();
    expect(screen.getByText('3 fichas pendientes')).toBeTruthy();
  });
});
