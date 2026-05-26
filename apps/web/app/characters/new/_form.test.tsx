/**
 * Unit tests for NewCharacterForm (world picker variant — C6).
 *
 * T-1: renders world select with all worlds as options
 * T-2: single-world auto-select — defaultValue is pre-set and hint shown
 * T-3: multi-world — placeholder option present; no hint
 * T-4: error message rendered when state.error is set
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewCharacterForm } from './_form';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useActionState: return [state, formAction, pending] synchronously
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useActionState: vi.fn((_, initial) => [initial, vi.fn(), false]),
  };
});

vi.mock('./actions', () => ({
  createCharacter: vi.fn(),
}));

vi.mock('@/components/ui', () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T-1: renders world options', () => {
  it('renders a select with one option per world', () => {
    const worlds = [
      { id: 'w1', name: 'Faerûn', slug: 'faerun' },
      { id: 'w2', name: 'Eberron', slug: 'eberron' },
    ];
    render(<NewCharacterForm worlds={worlds} />);
    expect(screen.getByRole('option', { name: 'Faerûn' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Eberron' })).toBeTruthy();
  });
});

describe('T-2: single-world auto-select', () => {
  it('pre-selects the only world and shows the hint', () => {
    const worlds = [{ id: 'w1', name: 'Faerûn', slug: 'faerun' }];
    render(<NewCharacterForm worlds={worlds} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('w1');
    expect(screen.getByText(/seleccionado automáticamente/i)).toBeTruthy();
  });
});

describe('T-3: multi-world — placeholder present', () => {
  it('shows placeholder option when there are multiple worlds', () => {
    const worlds = [
      { id: 'w1', name: 'Faerûn', slug: 'faerun' },
      { id: 'w2', name: 'Eberron', slug: 'eberron' },
    ];
    render(<NewCharacterForm worlds={worlds} />);
    expect(screen.getByRole('option', { name: /elegí un mundo/i })).toBeTruthy();
    expect(screen.queryByText(/seleccionado automáticamente/i)).toBeNull();
  });
});

describe('T-4: error message displayed', () => {
  it('renders state.error when present', async () => {
    const { useActionState } = await import('react');
    vi.mocked(useActionState).mockReturnValueOnce([{ error: 'Elegí un mundo.' }, vi.fn(), false]);

    const worlds = [{ id: 'w1', name: 'Faerûn', slug: 'faerun' }];
    render(<NewCharacterForm worlds={worlds} />);
    expect(screen.getByText('Elegí un mundo.')).toBeTruthy();
  });
});
