
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormLabel } from './form-label';

describe('FormLabel', () => {
  it('T1: renders children as label text', () => {
    render(<FormLabel htmlFor="test-input">Nombre</FormLabel>);
    expect(screen.getByText('Nombre')).toBeTruthy();
  });

  it('T2: renders asterisk inside aria-hidden span when required=true', () => {
    render(
      <FormLabel htmlFor="test-input" required>
        Nombre
      </FormLabel>,
    );
    // The asterisk span must exist and be aria-hidden
    const hiddenSpan = document.querySelector('span[aria-hidden="true"]');
    expect(hiddenSpan).toBeTruthy();
    expect(hiddenSpan?.textContent).toContain('*');
  });

  it('T3: does NOT render asterisk when required is absent', () => {
    render(<FormLabel htmlFor="test-input">Nombre</FormLabel>);
    expect(document.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('T4: does NOT render asterisk when required=false', () => {
    render(
      <FormLabel htmlFor="test-input" required={false}>
        Nombre
      </FormLabel>,
    );
    expect(document.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('T5: sets htmlFor correctly on the label element', () => {
    render(<FormLabel htmlFor="npc-name">Nombre</FormLabel>);
    const label = screen.getByText('Nombre').closest('label');
    expect(label?.htmlFor).toBe('npc-name');
  });
});
