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
  lineage: '',
  hpCurrent: null,
  hpMax: null,
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

  it('link href points to /characters/{id} for non-draft', () => {
    render(<PersonajeCard char={baseChar} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/abc');
  });

  it('link href points to /characters/{id}/wizard for draft', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'draft' }} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/abc/wizard');
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

    it('draft → stone pill "Borrador"', () => {
      render(<PersonajeCard char={{ ...baseChar, status: 'draft' }} />);
      expect(screen.getByText('Borrador')).toBeTruthy();
    });
  });

  it('draft card does NOT have personajes-char-card-active (no highlight)', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'draft' }} />);
    const link = screen.getByRole('link');
    expect(link.className).not.toContain('personajes-char-card-active');
  });

  // ── v3 design (spec personajes-v3-data) ──

  it('WPVC-LINEAGE-LINE-01: lineage rendered when non-empty', () => {
    render(
      <PersonajeCard
        char={{ ...baseChar, lineage: 'Semielfo · Bardo (Colegio del Saber) 4' }}
      />,
    );
    expect(screen.getByText('Semielfo · Bardo (Colegio del Saber) 4')).toBeTruthy();
  });

  it('WPVC-LINEAGE-LINE-01: no lineage line when empty', () => {
    const { container } = render(<PersonajeCard char={{ ...baseChar, lineage: '' }} />);
    // Lineage line uses italic styling; no italic descendant in body when empty.
    expect(container.querySelector('.italic')).toBeNull();
  });

  it('WPVC-HP-PILL-02: HP pill rendered when active + hpCurrent + hpMax set', () => {
    render(
      <PersonajeCard
        char={{ ...baseChar, status: 'active', hpCurrent: 28, hpMax: 32 }}
      />,
    );
    expect(screen.getByText('HP 28/32')).toBeTruthy();
  });

  it('WPVC-HP-PILL-02: no HP pill when hpCurrent/hpMax null', () => {
    render(
      <PersonajeCard
        char={{ ...baseChar, status: 'active', hpCurrent: null, hpMax: null }}
      />,
    );
    expect(screen.queryByText(/^HP /)).toBeNull();
  });

  it('WPVC-PENDING-TONE-03: pending_approval status pill has data-tone="pink"', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'pending_approval' }} />);
    const pill = screen.getByText('Pendiente DM');
    expect(pill.getAttribute('data-tone')).toBe('pink');
  });
});
