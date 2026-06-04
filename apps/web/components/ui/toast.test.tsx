/**
 * Toast component — C5 web-component-catalog
 * Tests: renders message / renders nothing when null.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './toast';

describe('Toast', () => {
  it('(1) renders nothing when message is null', () => {
    const { container } = render(<Toast message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('(2) renders the message text when provided', () => {
    render(<Toast message="El estado cambió, actualizando..." />);
    expect(screen.getByText('El estado cambió, actualizando...')).toBeTruthy();
  });

  it('(3) renders with role="status" and aria-live="polite"', () => {
    render(<Toast message="Test toast" />);
    const el = screen.getByRole('status');
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('(4) applies bg-warning-soft and text-warning-deep classes (warning-soft style from existing sites)', () => {
    render(<Toast message="Check" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('bg-warning-soft');
    expect(el.className).toContain('text-warning-deep');
  });
});
