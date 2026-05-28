import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EncuentrosListView, type EncuentroRow } from './encuentros-list-view';

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

  it('T2 WEL-DM-ONLY-01 player: empty-state copy', () => {
    render(<EncuentrosListView role="player" rows={[]} />);
    expect(screen.getByText(/Esta sección es para DMs/)).toBeTruthy();
  });

  it('T3 WEL-ROW-CONTENT-02 + WEL-CREATE-CTA-03: name + campaign + Ronda + combatientes + CTA', () => {
    render(<EncuentrosListView role="dm" rows={[baseRow]} />);
    expect(screen.getByText('Emboscada en el Vado')).toBeTruthy();
    expect(screen.getByText('Tres Lunas')).toBeTruthy();
    expect(screen.getByText('Ronda 2')).toBeTruthy();
    expect(screen.getByText('5 combatientes')).toBeTruthy();
    expect(screen.getByText(/Iniciar encuentro nuevo/)).toBeTruthy();
  });
});
