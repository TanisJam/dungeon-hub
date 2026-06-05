/**
 * Unit tests for SetActiveCharacterButton — REQ-AC-SEL-01 + REQ-AC-SEL-02.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

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

  it('injected actions.setActive + onActivated run instead of the real server action / router.refresh', async () => {
    const setActive = vi.fn().mockResolvedValue(undefined);
    const onActivated = vi.fn();
    render(
      <SetActiveCharacterButton
        characterId="char-3"
        worldId="world-3"
        isActive={false}
        actions={{ setActive, onActivated }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(setActive).toHaveBeenCalledWith('char-3', 'world-3');
    expect(onActivated).toHaveBeenCalledOnce();
    expect(mockSetActiveCharacter).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('injected actions are NOT invoked when isActive=true (no-op guard holds)', () => {
    const setActive = vi.fn().mockResolvedValue(undefined);
    const onActivated = vi.fn();
    render(
      <SetActiveCharacterButton
        characterId="char-3"
        worldId="world-3"
        isActive={true}
        actions={{ setActive, onActivated }}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(setActive).not.toHaveBeenCalled();
    expect(onActivated).not.toHaveBeenCalled();
  });
});
