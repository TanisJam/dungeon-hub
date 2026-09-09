
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormErrorAlert } from './form-error-alert';

describe('FormErrorAlert', () => {
  it('T1: renders nothing when message is null', () => {
    const { container } = render(<FormErrorAlert message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('T2: renders role="alert" when message is non-null', () => {
    render(<FormErrorAlert message="El nombre es obligatorio." />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('T3: rendered element contains the message text', () => {
    render(<FormErrorAlert message="Error al guardar." />);
    expect(screen.getByRole('alert').textContent).toBe('Error al guardar.');
  });

  it('T4: applies bg-danger-soft token class (REQ-B1-04)', () => {
    render(<FormErrorAlert message="Something went wrong." />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-danger-soft');
    expect(alert.className).toContain('text-danger');
  });

  it('T5: merges caller className after base classes', () => {
    render(<FormErrorAlert message="Error con margen." className="mb-3" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('mb-3');
    expect(alert.className).toContain('text-danger');
    expect(alert.className).toContain('bg-danger-soft');
  });

  it('T6: renders nothing when message is undefined', () => {
    const { container } = render(<FormErrorAlert message={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
