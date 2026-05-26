/**
 * ApprovalActions — DM approve/reject/revert button matrix.
 *
 * SDD dm-session-panel (spec #857):
 *   REQ-CAU-APPROVE-BUTTON — gm + pending → "Aprobar" visible
 *   REQ-CAU-REJECT-BUTTON  — gm + pending → "Rechazar" visible
 *   REQ-CAU-REVERT-BUTTON  — gm + active  → "Devolver a borrador" visible
 *   Non-GM (player/null)   → nothing rendered
 *   GM + other statuses    → nothing rendered
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../actions', () => ({
  approveCharacter: vi.fn().mockResolvedValue({ ok: true }),
  rejectCharacter: vi.fn().mockResolvedValue({ ok: true }),
}));

import { ApprovalActions } from './approval-actions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ApprovalActions — REQ-CAU button matrix', () => {
  describe('gm + pending_approval', () => {
    it('renders both Aprobar and Rechazar (REQ-CAU-APPROVE-BUTTON + REQ-CAU-REJECT-BUTTON)', () => {
      render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="pending_approval" />,
      );
      expect(screen.getByRole('button', { name: 'Aprobar' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Rechazar' })).toBeTruthy();
    });

    it('clicking Aprobar calls approveCharacter with characterId', async () => {
      const { approveCharacter } = await import('../actions');
      render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="pending_approval" />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
      await vi.waitFor(() => {
        expect(approveCharacter).toHaveBeenCalledWith('c-1');
      });
    });

    it('clicking Rechazar calls rejectCharacter with characterId', async () => {
      const { rejectCharacter } = await import('../actions');
      render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="pending_approval" />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
      await vi.waitFor(() => {
        expect(rejectCharacter).toHaveBeenCalledWith('c-1');
      });
    });

    it('does NOT render "Devolver a borrador" (only valid for active status)', () => {
      render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="pending_approval" />,
      );
      expect(screen.queryByRole('button', { name: 'Devolver a borrador' })).toBeNull();
    });
  });

  describe('gm + active (REQ-CAU-REVERT-BUTTON)', () => {
    it('renders "Devolver a borrador" only', () => {
      render(<ApprovalActions characterId="c-1" callerRole="gm" status="active" />);
      expect(screen.getByRole('button', { name: 'Devolver a borrador' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull();
    });

    it('Devolver a borrador prompts for confirmation; cancel → no action', async () => {
      const { rejectCharacter } = await import('../actions');
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ApprovalActions characterId="c-1" callerRole="gm" status="active" />);
      fireEvent.click(screen.getByRole('button', { name: 'Devolver a borrador' }));

      expect(confirmSpy).toHaveBeenCalled();
      expect(rejectCharacter).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('Devolver a borrador prompts for confirmation; accept → calls rejectCharacter', async () => {
      const { rejectCharacter } = await import('../actions');
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<ApprovalActions characterId="c-1" callerRole="gm" status="active" />);
      fireEvent.click(screen.getByRole('button', { name: 'Devolver a borrador' }));

      await vi.waitFor(() => {
        expect(rejectCharacter).toHaveBeenCalledWith('c-1');
      });
      confirmSpy.mockRestore();
    });
  });

  describe('gm + draft / retired / dead', () => {
    it('renders nothing for status=draft', () => {
      const { container } = render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="draft" />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing for status=retired', () => {
      const { container } = render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="retired" />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing for status=dead', () => {
      const { container } = render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="dead" />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('player and null callerRole', () => {
    it('renders nothing for player + pending_approval', () => {
      const { container } = render(
        <ApprovalActions characterId="c-1" callerRole="player" status="pending_approval" />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing for player + active', () => {
      const { container } = render(
        <ApprovalActions characterId="c-1" callerRole="player" status="active" />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing for null callerRole + pending_approval', () => {
      const { container } = render(
        <ApprovalActions characterId="c-1" callerRole={null} status="pending_approval" />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('tap targets (mobile-first)', () => {
    it('all rendered buttons have min-h-[44px] class', () => {
      const { container } = render(
        <ApprovalActions characterId="c-1" callerRole="gm" status="pending_approval" />,
      );
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      for (const btn of Array.from(buttons)) {
        expect(btn.className).toContain('min-h-[44px]');
      }
    });
  });
});
