import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonajeCard } from './personaje-card';
import type { RosterCharacter } from './types';

const baseChar: RosterCharacter = {
  id: 'abc',
  worldId: 'world-1',
  name: 'Brann',
  status: 'active',
  xp: 100,
  updatedAt: '2026-01-01',
};

describe('PersonajeCard', () => {
  it('renders portrait initial as first letter uppercase', () => {
    render(<PersonajeCard char={baseChar} />);
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('renders "?" as initial when name is whitespace', () => {
    const char = { ...baseChar, name: '   ' };
    render(<PersonajeCard char={char} />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('name element has class truncate', () => {
    render(<PersonajeCard char={baseChar} />);
    const nameEl = screen.getByText('Brann');
    expect(nameEl.className).toContain('truncate');
  });

  it('renders world pill only when worldName is provided', () => {
    const { rerender } = render(<PersonajeCard char={baseChar} worldName="Tres Lunas" />);
    expect(screen.getByText('Tres Lunas')).toBeTruthy();

    rerender(<PersonajeCard char={baseChar} />);
    expect(screen.queryByText('Tres Lunas')).toBeNull();
  });

  it('link href points to /characters/{id}', () => {
    render(<PersonajeCard char={baseChar} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/abc');
  });

  it('highlight=true adds class personajes-char-card-active', () => {
    render(<PersonajeCard char={baseChar} highlight={true} />);
    const link = screen.getByRole('link');
    expect(link.className).toContain('personajes-char-card-active');
  });

  it('highlight=false (default) does NOT add personajes-char-card-active', () => {
    render(<PersonajeCard char={baseChar} />);
    const link = screen.getByRole('link');
    expect(link.className).not.toContain('personajes-char-card-active');
  });

  describe('status pill mapping (PERS-CARD-02)', () => {
    it('active → green pill "Activo"', () => {
      render(<PersonajeCard char={{ ...baseChar, status: 'active' }} />);
      expect(screen.getByText('Activo')).toBeTruthy();
    });

    it('pending_approval → amber pill "Pendiente DM"', () => {
      render(<PersonajeCard char={{ ...baseChar, status: 'pending_approval' }} />);
      expect(screen.getByText('Pendiente DM')).toBeTruthy();
    });

    it('retired → stone pill "Retirado"', () => {
      render(<PersonajeCard char={{ ...baseChar, status: 'retired' }} />);
      expect(screen.getByText('Retirado')).toBeTruthy();
    });

    it('dead → stone pill "Muerto"', () => {
      render(<PersonajeCard char={{ ...baseChar, status: 'dead' }} />);
      expect(screen.getByText('Muerto')).toBeTruthy();
    });
  });
});
