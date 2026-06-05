/**
 * Unit tests for Banner component.
 *
 * T1: renders children text
 * T2: tone="amber" maps to warning-soft classes (existing, zero-regression)
 * T3: tone="danger" maps to danger-soft classes (new tone)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Banner } from './banner';

describe('Banner', () => {
  it('T1: renders children', () => {
    render(<Banner tone="stone">Personaje retirado</Banner>);
    expect(screen.getByText('Personaje retirado')).toBeTruthy();
  });

  it('T2: tone="amber" uses warning-soft classes', () => {
    render(<Banner tone="amber">Pendiente de aprobación</Banner>);
    const el = screen.getByText('Pendiente de aprobación');
    expect(el.className).toContain('bg-warning-soft');
    expect(el.className).toContain('text-warning-deep');
  });

  it('T3: tone="danger" uses danger-soft classes', () => {
    render(<Banner tone="danger">Acción no permitida</Banner>);
    const el = screen.getByText('Acción no permitida');
    expect(el.className).toContain('bg-danger-soft');
    expect(el.className).toContain('text-danger');
    expect(el.className).toContain('border-danger');
  });
});
