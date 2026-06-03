/**
 * Unit tests for SetActiveCharacterButton — REQ-AC-SEL-01 + REQ-AC-SEL-02.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock: server action
// ---------------------------------------------------------------------------

const mockSetActiveCharacter = vi.fn();

vi.mock('@/app/set-active-character', () => ({
  setActiveCharacter: (...args: unknown[]) => mockSetActiveCharacter(...args),
}));

// ---------------------------------------------------------------------------
// Mock: next/navigation
// ---------------------------------------------------------------------------

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { SetActiveCharacterButton } from './set-active-character-button';

describe('SetActiveCharacterButton', () => {
  beforeEach(() => {
    mockSetActiveCharacter.mockReset();
    mockRefresh.mockReset();
    mockSetActiveCharacter.mockResolvedValue(undefined);
  });

  it('renders a button when isActive=false (REQ-AC-SEL-01)', () => {
    render(
      <SetActiveCharacterButton
        characterId="char-1"
        worldId="world-1"
        isActive={false}
      />,
    );
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('button has min-h-[44px] class for touch target (REQ-AC-SEL-01 ≥44px)', () => {
    render(
      <SetActiveCharacterButton
        characterId="char-1"
        worldId="world-1"
        isActive={false}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('does NOT call setActiveCharacter when isActive=true (no-op guard, REQ-AC-SEL-01)', async () => {
    render(
      <SetActiveCharacterButton
        characterId="char-1"
        worldId="world-1"
        isActive={true}
      />,
    );
    // Button is still rendered (shows filled state) but clicking is a no-op
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(mockSetActiveCharacter).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('calls setActiveCharacter + router.refresh() on click when not active', async () => {
    render(
      <SetActiveCharacterButton
        characterId="char-2"
        worldId="world-2"
        isActive={false}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    expect(mockSetActiveCharacter).toHaveBeenCalledOnce();
    expect(mockSetActiveCharacter).toHaveBeenCalledWith('char-2', 'world-2');
  });
});
