import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonajeCard } from './personaje-card';
import type { RosterCharacter } from './types';

// ---------------------------------------------------------------------------
// Mock: next/navigation (required because PersonajeCard renders SetActiveCharacterButton)
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock: setActiveCharacter server action
// ---------------------------------------------------------------------------

vi.mock('@/app/set-active-character', () => ({
  setActiveCharacter: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  // ── ADR F-VIS: personajes-char-card-active is now on the outer div wrapper,
  //    NOT on the <Link>. The Link is flex-1 inside the wrapper. ──

  it('highlight=true adds class personajes-char-card-active to outer wrapper div', () => {
    const { container } = render(<PersonajeCard char={baseChar} highlight={true} />);
    // The outer wrapper is the first div child of the container
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('personajes-char-card-active');
  });

  it('highlight=true does NOT add personajes-char-card-active to the Link', () => {
    render(<PersonajeCard char={baseChar} highlight={true} />);
    const link = screen.getByRole('link');
    expect(link.className).not.toContain('personajes-char-card-active');
  });

  it('highlight=false (default) does NOT add personajes-char-card-active', () => {
    const { container } = render(<PersonajeCard char={baseChar} />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).not.toContain('personajes-char-card-active');
  });

  it('draft card does NOT have personajes-char-card-active (no highlight)', () => {
    const { container } = render(<PersonajeCard char={{ ...baseChar, status: 'draft' }} />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).not.toContain('personajes-char-card-active');
  });

  // ── ADR F-VIS: "Jugando" pill (tone=accent) appears when highlight=true ──

  it('Jugando pill rendered when highlight=true (REQ-AC-SEL-03)', () => {
    render(<PersonajeCard char={baseChar} highlight={true} />);
    expect(screen.getByText('Jugando')).toBeTruthy();
  });

  it('Jugando pill NOT rendered when highlight=false', () => {
    render(<PersonajeCard char={baseChar} highlight={false} />);
    expect(screen.queryByText('Jugando')).toBeNull();
  });

  it('Jugando pill has data-tone="accent"', () => {
    render(<PersonajeCard char={baseChar} highlight={true} />);
    const pill = screen.getByText('Jugando');
    expect(pill.getAttribute('data-tone')).toBe('accent');
  });

  // ── REQ-AC-SEL-02: SetActiveCharacterButton only for active status ──

  it('SetActiveCharacterButton rendered for active status card', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'active' }} />);
    // The button is the SetActiveCharacterButton (☆ or ★ inside)
    const btns = screen.getAllByRole('button');
    expect(btns.length).toBeGreaterThan(0);
  });

  it('SetActiveCharacterButton NOT rendered for draft status card (REQ-AC-SEL-02)', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'draft' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('SetActiveCharacterButton NOT rendered for retired status card (REQ-AC-SEL-02)', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'retired' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('SetActiveCharacterButton NOT rendered for dead status card (REQ-AC-SEL-02)', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'dead' }} />);
    expect(screen.queryByRole('button')).toBeNull();
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
    render(<PersonajeCard char={{ ...baseChar, lineage: '' }} />);
    expect(screen.queryByTestId('char-lineage')).toBeNull();
  });

  it('WPVC-PORTRAIT-CSS-04: portrait element has class personajes-portrait', () => {
    const { container } = render(<PersonajeCard char={baseChar} />);
    expect(container.querySelector('.personajes-portrait')).not.toBeNull();
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

  it('WPVC-PENDING-TONE-03: pending_approval status pill has data-tone="accent"', () => {
    render(<PersonajeCard char={{ ...baseChar, status: 'pending_approval' }} />);
    const pill = screen.getByText('Pendiente DM');
    expect(pill.getAttribute('data-tone')).toBe('accent');
  });
});
