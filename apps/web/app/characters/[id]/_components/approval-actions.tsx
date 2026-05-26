'use client';

/**
 * ApprovalActions — DM approve/reject/revert buttons on the character sheet.
 *
 * SDD dm-session-panel (spec #857) —
 *   REQ-CAU-APPROVE-BUTTON: gm + pending_approval → "Aprobar"
 *   REQ-CAU-REJECT-BUTTON:  gm + pending_approval → "Rechazar"
 *   REQ-CAU-REVERT-BUTTON:  gm + active           → "Devolver a borrador"
 *
 * Visibility matrix is enforced here: any other (role × status) renders nothing.
 * The Server Component parent must pass the real callerRole + character.status —
 * this island does not re-check server state.
 *
 * "Devolver a borrador" is destructive (turns an active character editable
 * again), so it surfaces a window.confirm() before firing.
 */
import { useState, useTransition } from 'react';
import { approveCharacter, rejectCharacter } from '../actions';

type CallerRole = 'gm' | 'player' | null;

type CharacterStatusForActions =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'retired'
  | 'dead';

interface ApprovalActionsProps {
  characterId: string;
  callerRole: CallerRole;
  status: CharacterStatusForActions;
}

export function ApprovalActions({
  characterId,
  callerRole,
  status,
}: ApprovalActionsProps) {
  const [error, setError] = useState<string | null>(null);
  const [isApprovePending, startApprove] = useTransition();
  const [isRejectPending, startReject] = useTransition();
  const isPending = isApprovePending || isRejectPending;

  // Visibility gate: only GM gets buttons. Non-GMs render nothing.
  if (callerRole !== 'gm') return null;
  // GM only acts on pending_approval or active. Other statuses → no buttons.
  if (status !== 'pending_approval' && status !== 'active') return null;

  function handleApprove() {
    if (isPending) return;
    setError(null);
    startApprove(async () => {
      const result = await approveCharacter(characterId);
      if (!result.ok) setError(result.error);
    });
  }

  function handleReject() {
    if (isPending) return;
    setError(null);
    startReject(async () => {
      const result = await rejectCharacter(characterId);
      if (!result.ok) setError(result.error);
    });
  }

  function handleRevert() {
    if (isPending) return;
    const confirmed = window.confirm(
      'Devolver a borrador permite al jugador re-editar el personaje y deberá enviarlo para aprobación de nuevo. ¿Continuar?',
    );
    if (!confirmed) return;
    setError(null);
    startReject(async () => {
      const result = await rejectCharacter(characterId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-2" aria-label="Acciones de aprobación">
      {status === 'pending_approval' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="min-h-[44px] flex-1 rounded-md border border-primary-deep bg-primary px-3 py-2 text-xs font-semibold text-paper transition-colors hover:bg-primary-deep disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
          >
            {isApprovePending ? 'Aprobando…' : 'Aprobar'}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={isPending}
            className="min-h-[44px] flex-1 rounded-md border border-line bg-paper-soft px-3 py-2 text-xs font-semibold text-ink-mute transition-colors hover:bg-paper-muted hover:text-ink disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
          >
            {isRejectPending ? 'Rechazando…' : 'Rechazar'}
          </button>
        </div>
      )}

      {status === 'active' && (
        <div className="flex">
          <button
            type="button"
            onClick={handleRevert}
            disabled={isPending}
            className="min-h-[44px] flex-1 rounded-md border border-warning-deep bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-deep transition-colors hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
          >
            {isRejectPending ? 'Devolviendo…' : 'Devolver a borrador'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[10px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
