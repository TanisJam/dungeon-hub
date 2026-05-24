/**
 * Unit tests for DeleteCharacterButton component.
 *
 * T-1: renders button with character name accessible label
 * T-2: clicking button opens confirm dialog
 * T-3: clicking "Cancelar" closes dialog without calling the action
 * T-4: clicking "Eliminar" in dialog calls deleteCharacter action
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { DeleteCharacterButton } from './_delete-button';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./actions', () => ({
  deleteCharacter: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// T-1: button renders with character name
// ---------------------------------------------------------------------------

describe('T-1: renders delete button', () => {
  it('renders a button labeled "Eliminar personaje"', () => {
    render(<DeleteCharacterButton characterId="abc-123" characterName="Gandalf" />);
    expect(screen.getByRole('button', { name: /eliminar personaje/i })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T-2: clicking button opens confirm dialog
// ---------------------------------------------------------------------------

describe('T-2: clicking button opens confirm dialog', () => {
  it('shows confirmation dialog with character name after click', () => {
    render(<DeleteCharacterButton characterId="abc-123" characterName="Gandalf" />);

    fireEvent.click(screen.getByRole('button', { name: /eliminar personaje/i }));

    expect(screen.getByText(/¿Eliminar a Gandalf\?/i)).toBeTruthy();
    expect(screen.getByText(/esta acción no se puede deshacer/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T-3: clicking Cancelar closes dialog without action
// ---------------------------------------------------------------------------

describe('T-3: Cancelar closes dialog without calling action', () => {
  it('hides dialog on Cancelar click and does not call deleteCharacter', async () => {
    const { deleteCharacter } = await import('./actions');
    vi.mocked(deleteCharacter).mockClear();

    render(<DeleteCharacterButton characterId="abc-123" characterName="Gandalf" />);
    fireEvent.click(screen.getByRole('button', { name: /eliminar personaje/i }));
    expect(screen.getByText(/¿Eliminar a Gandalf\?/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => {
      expect(screen.queryByText(/¿Eliminar a Gandalf\?/i)).toBeNull();
    });
    expect(vi.mocked(deleteCharacter)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-4: clicking Eliminar (confirm) calls deleteCharacter action
// ---------------------------------------------------------------------------

describe('T-4: Eliminar confirm calls deleteCharacter', () => {
  it('calls deleteCharacter with the correct characterId when confirmed', async () => {
    const { deleteCharacter } = await import('./actions');
    vi.mocked(deleteCharacter).mockClear();

    render(<DeleteCharacterButton characterId="abc-123" characterName="Gandalf" />);
    fireEvent.click(screen.getByRole('button', { name: /eliminar personaje/i }));

    // The confirm button inside the dialog
    const confirmBtn = screen.getByRole('button', { name: /^eliminar$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(vi.mocked(deleteCharacter)).toHaveBeenCalledWith('abc-123');
    });
  });
});
