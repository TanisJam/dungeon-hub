/**
 * Tests for PendingFichasCard component
 *
 * REQ-IDM-PENDING-CARD-02: renders eyebrow, avatar stack, title, sub, CTA
 * REQ-PS-CARD-BUTTON-API-01: root is a <button> that fires onClick (post pendientes-sheet wiring)
 * REQ-IDM-CSS-SCOPED-08: root element has class inicio-pending-bg
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PendingFichasCard } from './pending-fichas-card';
import { MOCK_PENDING_FICHAS, MOCK_PENDING_OLDEST_AGE } from '../dm-mock-data';

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
});
