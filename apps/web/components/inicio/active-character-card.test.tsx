
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveCharacterCard } from './active-character-card';
import type { ActiveCharacter } from './types';

const mockChar: ActiveCharacter = {
  id: 'mock-char-1',
  name: 'Brann Cuervosombrío',
  initial: 'B',
  lineage: 'Semielfo · Bardo 3',
  hp: '21/24',
  ac: 13,
  init: 3,
};

describe('ActiveCharacterCard', () => {
  it('T1: renders portrait initial, character name, and lineage', () => {
    render(<ActiveCharacterCard char={mockChar} />);
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('Brann Cuervosombrío')).toBeTruthy();
    expect(screen.getByText('Semielfo · Bardo 3')).toBeTruthy();
  });

  it('T2: renders 3 pills — HP 21/24, AC 13, Init +3', () => {
    render(<ActiveCharacterCard char={mockChar} />);
    expect(screen.getByText('HP 21/24')).toBeTruthy();
    expect(screen.getByText('AC 13')).toBeTruthy();
    expect(screen.getByText('Init +3')).toBeTruthy();
  });

  it('T3: link element has href pointing to the character detail page', () => {
    render(<ActiveCharacterCard char={mockChar} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/mock-char-1');
  });

  it('T4: HP pill renders "HP 0/32" for a downed character (hp="0/32")', () => {
    const downedChar: ActiveCharacter = { ...mockChar, hp: '0/32' };
    render(<ActiveCharacterCard char={downedChar} />);
    expect(screen.getByText('HP 0/32')).toBeTruthy();
  });
});
