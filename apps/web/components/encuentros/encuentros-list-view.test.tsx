import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EncuentrosListView, type EncuentroRow } from './encuentros-list-view';

// Mock next/link — the new player state renders a link CTA
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const baseRow: EncuentroRow = {
  encounter: {
    id: 'enc-1',
    campaignId: 'camp-1',
    name: 'Emboscada en el Vado',
    round: 2,
    status: 'active',
    currentCombatantId: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  campaignName: 'Tres Lunas',
  combatantsCount: 5,
};

describe('EncuentrosListView (WEL-*)', () => {
  it('T1 WEL-DM-ONLY-01 dm with encounters: rows rendered', () => {
    const rows: EncuentroRow[] = [
      baseRow,
      { ...baseRow, encounter: { ...baseRow.encounter, id: 'enc-2', name: 'Pacto Roto' } },
    ];
    render(<EncuentrosListView role="dm" rows={rows} />);
    expect(screen.getByText('Emboscada en el Vado')).toBeTruthy();
    expect(screen.getByText('Pacto Roto')).toBeTruthy();
  });

  // T2: updated to match new useful player state (REQ-DPPMC-ENCUENTROS-04, Slice C)
  it('T2 WEL-DM-ONLY-01 player: useful state — not a dead-end (REQ-DPPMC-ENCUENTROS-04)', () => {
    render(<EncuentrosListView role="player" rows={[]} />);
    // New copy — informational, not a dead-end
    expect(screen.getByText(/Los combates los maneja tu DM/)).toBeTruthy();
  });

  it('T3 WEL-ROW-CONTENT-02 + WEL-CREATE-CTA-03: name + campaign + Ronda + combatientes + CTA', () => {
    render(<EncuentrosListView role="dm" rows={[baseRow]} />);
    expect(screen.getByText('Emboscada en el Vado')).toBeTruthy();
    expect(screen.getByText('Tres Lunas')).toBeTruthy();
    expect(screen.getByText('Ronda 2')).toBeTruthy();
    expect(screen.getByText('5 combatientes')).toBeTruthy();
    expect(screen.getByText(/Iniciar encuentro nuevo/)).toBeTruthy();
  });

  // REQ-DPPMC-ENCUENTROS-04: player state renders a CTA linking to /inicio
  it('T4 player: CTA links to /inicio (REQ-DPPMC-ENCUENTROS-04)', () => {
    render(<EncuentrosListView role="player" rows={[]} />);
    const ctaLink = screen.getByRole('link', { name: /Ir a mis sesiones/i });
    expect(ctaLink).toBeTruthy();
    expect(ctaLink.getAttribute('href')).toBe('/inicio');
  });

  // REQ-DPPMC-ENCUENTROS-04: no combat UI in player state (combat is FROZEN)
  it('T5 player: no combat UI visible (FROZEN — REQ-DPPMC-ENCUENTROS-04)', () => {
    render(<EncuentrosListView role="player" rows={[]} />);
    // Should NOT find any reference to iniciar/combat UI
    expect(screen.queryByText(/Iniciar encuentro/i)).toBeNull();
    expect(screen.queryByText(/iniciar/i)).toBeNull();
  });

  // DM branch stays unchanged — regression guard
  it('T6 DM branch: unchanged — DashedCTA + rows (DM branch regression guard)', () => {
    render(<EncuentrosListView role="dm" rows={[]} />);
    // DM with no encounters: empty state + DashedCTA
    expect(screen.getByText(/Iniciar encuentro nuevo/)).toBeTruthy();
    // Should NOT render the player informational state
    expect(screen.queryByText(/Los combates los maneja tu DM/)).toBeNull();
  });
});
