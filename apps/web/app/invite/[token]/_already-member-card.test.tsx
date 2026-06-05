/**
 * _already-member-card.test.tsx — Unit tests for AlreadyMemberCard.
 *
 * WT-DPPM-A-01: GM + alreadyMember → GM-aware CTA panel (not dead-end).
 * WT-DPPM-A-02: player + alreadyMember → existing player "Ya sos parte" path.
 *
 * SDD: dm-player-play-model Slice A, REQ-DPPM-A-INV-01..04, REQ-DPPM-A-INV-06.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlreadyMemberCard } from './_already-member-card';

const defaultProps = {
  campaignId: 'camp-123',
  campaignName: 'Lost Mines',
  worldName: 'Forgotten Realm',
};

describe('AlreadyMemberCard', () => {
  // WT-DPPM-A-01: GM path
  describe('worldRole === gm', () => {
    it('renders "Sos el DM de esta campaña" title (not dead-end message)', () => {
      render(<AlreadyMemberCard {...defaultProps} worldRole="gm" />);
      expect(screen.getByText(/Sos el DM de esta campaña/)).toBeTruthy();
      // Must NOT show the plain player dead-end message
      expect(screen.queryByText(/Ya sos parte de esta campaña/)).toBeNull();
    });

    it('renders primary CTA linking to /campanas/{campaignId}', () => {
      render(<AlreadyMemberCard {...defaultProps} worldRole="gm" />);
      const link = screen.getByRole('link', { name: /Ir a las sesiones/ });
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/campanas/camp-123');
    });

    it('renders secondary link to /characters/new', () => {
      render(<AlreadyMemberCard {...defaultProps} worldRole="gm" />);
      const link = screen.getByRole('link', { name: /Crear un personaje/ });
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/characters/new');
    });

    it('mentions the campaign name and world name', () => {
      render(<AlreadyMemberCard {...defaultProps} worldRole="gm" />);
      expect(screen.getByText(/Lost Mines/)).toBeTruthy();
      expect(screen.getByText(/Forgotten Realm/)).toBeTruthy();
    });
  });

  // WT-DPPM-A-02: Non-GM path (player or null)
  describe('worldRole !== gm (player / null)', () => {
    it.each([['player' as const], [null]] as const)(
      'worldRole=%s → renders "Ya sos parte de esta campaña"',
      (role) => {
        render(<AlreadyMemberCard {...defaultProps} worldRole={role} />);
        expect(screen.getByText(/Ya sos parte de esta campaña/)).toBeTruthy();
        // GM-specific text must NOT appear
        expect(screen.queryByText(/Sos el DM de esta campaña/)).toBeNull();
        expect(screen.queryByRole('link', { name: /Crear un personaje/ })).toBeNull();
      },
    );

    it('renders "Ir a la campaña" link for player', () => {
      render(<AlreadyMemberCard {...defaultProps} worldRole="player" />);
      const link = screen.getByRole('link', { name: /Ir a la campaña/ });
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/campanas/camp-123');
    });
  });
});
