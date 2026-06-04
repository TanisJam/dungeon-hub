/**
 * Unit tests for FormErrorAlert component — B1 (web-component-catalog)
 *
 * T1: renders nothing (null) when message is null
 * T2: renders role="alert" element when message is non-null
 * T3: rendered element contains the message text
 * T4: has bg-danger-soft token class (REQ-B1-04 — spec wins over design note)
 */
import React from 'react';
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
});
