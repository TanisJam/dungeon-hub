/**
 * Unit tests for HomebrewUploadForm (Custom content via JSON upload, MVP #3.8).
 *
 * T-1: renders the world's homebrew source code
 * T-2: renders the hidden worldId field (forwarded, not user-editable)
 * T-3: renders the paste textarea seeded with the JSON example as placeholder
 * T-4: renders the error message when state.status === 'error'
 * T-5: renders the success message (created/updated) when state.status === 'success'
 * T-6: submit button is disabled while pending
 *
 * afterEach(cleanup) is already global (apps/web/vitest.setup.ts) — not re-added.
 */
import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomebrewUploadForm } from './_form';

// useActionState: return [state, formAction, pending] synchronously, same
// mocking pattern as apps/web/app/characters/new/_form.test.tsx.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useActionState: vi.fn((_, initial) => [initial, vi.fn(), false]),
  };
});

vi.mock('./actions', () => ({
  uploadHomebrewItems: vi.fn(),
  INITIAL_UPLOAD_STATE: { status: 'idle', message: null },
}));

vi.mock('@/components/ui', () => ({
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}));

describe('T-1: source code display', () => {
  it('renders the per-world homebrew source code', () => {
    render(<HomebrewUploadForm worldId="w1" sourceCode="HB-4dc54680" />);
    expect(screen.getByText('HB-4dc54680')).toBeTruthy();
  });
});

describe('T-2: hidden worldId field', () => {
  it('forwards worldId as a hidden input', () => {
    const { container } = render(<HomebrewUploadForm worldId="world-123" sourceCode="HB-abc12345" />);
    const hidden = container.querySelector('input[name="worldId"]') as HTMLInputElement;
    expect(hidden).toBeTruthy();
    expect(hidden.value).toBe('world-123');
  });
});

describe('T-3: paste textarea', () => {
  it('renders a textarea named itemsJson with the JSON example as placeholder', () => {
    render(<HomebrewUploadForm worldId="w1" sourceCode="HB-4dc54680" />);
    const textarea = screen.getByLabelText(/items \(array json\)/i) as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.name).toBe('itemsJson');
    expect(textarea.placeholder).toContain('"name"');
  });

  it('does NOT render a file input or drag-drop zone — paste only (brief scope)', () => {
    const { container } = render(<HomebrewUploadForm worldId="w1" sourceCode="HB-4dc54680" />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('T-4: error message', () => {
  it('renders state.message when status is error', async () => {
    const { useActionState } = await import('react');
    vi.mocked(useActionState).mockReturnValueOnce([
      { status: 'error', message: 'El texto no es JSON válido.' },
      vi.fn(),
      false,
    ]);

    render(<HomebrewUploadForm worldId="w1" sourceCode="HB-4dc54680" />);
    expect(screen.getByRole('alert').textContent).toBe('El texto no es JSON válido.');
  });
});

describe('T-5: success message', () => {
  it('renders state.message when status is success', async () => {
    const { useActionState } = await import('react');
    vi.mocked(useActionState).mockReturnValueOnce([
      { status: 'success', message: '2 item(s) creado(s), 1 actualizado(s).', created: 2, updated: 1 },
      vi.fn(),
      false,
    ]);

    render(<HomebrewUploadForm worldId="w1" sourceCode="HB-4dc54680" />);
    expect(screen.getByRole('status').textContent).toBe('2 item(s) creado(s), 1 actualizado(s).');
  });
});

describe('T-6: pending state', () => {
  it('disables the submit button while pending', async () => {
    const { useActionState } = await import('react');
    vi.mocked(useActionState).mockReturnValueOnce([
      { status: 'idle', message: null },
      vi.fn(),
      true,
    ]);

    render(<HomebrewUploadForm worldId="w1" sourceCode="HB-4dc54680" />);
    const button = screen.getByRole('button', { name: /subiendo/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
