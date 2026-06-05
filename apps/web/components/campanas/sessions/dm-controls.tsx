'use client';

// DmControls — sticky bottom action bar for DM session transitions.
// REQ-DPPMB-CTRL-01, REQ-DPPMB-CTRL-02, REQ-DPPMB-CTRL-03, REQ-DPPMB-CTRL-04.
// ADR-B6: local copy of the ALLOWED status→actions map; comment points at state-machine.ts.
//
// State-machine map (LOCAL COPY — mirrors apps/api/src/use-cases/sessions/state-machine.ts)
//   scheduled → [Iniciar, Cancelar]
//   active    → [Pausar, Completar, Cancelar]
//   paused    → [Reanudar, Completar, Cancelar]
//   completed → (terminal — no actions)
//   cancelled → (terminal — no actions)
//
// 375px layout: horizontal flex wrap inside the parent sticky bar container.
// The sticky bar container is owned by SessionDetailView (fixed bottom-16 z-10).
// DmControls owns only the button row inside that container.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { EnrichedParticipant, SessionStatus } from '@/app/campanas/[id]/sessions/actions';
import {
  startSession,
  pauseSession,
  resumeSession,
  cancelSession,
} from '@/app/campanas/[id]/sessions/actions';
import { CompleteForm } from './complete-form';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DmControlsProps {
  sessionId: string;
  campaignId: string;
  status: SessionStatus;
  accessLevel: 'gm' | 'participant' | 'campaign-member';
  /** Active participants (leftAt IS NULL) — forwarded to CompleteForm for item-grant selects. */
  participants: Pick<EnrichedParticipant, 'characterId' | 'userId' | 'name' | 'leftAt'>[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DmControls({
  sessionId,
  campaignId,
  status,
  accessLevel,
  participants,
}: DmControlsProps) {
  // REQ-DPPMB-CTRL-01: render nothing for non-GM.
  if (accessLevel !== 'gm') return null;

  // Terminal states: no controls.
  if (status === 'completed' || status === 'cancelled') return null;

  return (
    <DmControlsInner
      sessionId={sessionId}
      campaignId={campaignId}
      status={status}
      participants={participants}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner (stateful) — extracted so the outer component can bail early without
// hooks ordering issues.
// ---------------------------------------------------------------------------

function DmControlsInner({
  sessionId,
  campaignId,
  status,
  participants,
}: {
  sessionId: string;
  campaignId: string;
  status: Exclude<SessionStatus, 'completed' | 'cancelled'>;
  participants: DmControlsProps['participants'];
}) {
  const [pending, setPending] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTransition(
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError(null);
    setPending(true);
    const result = await action();
    setPending(false);

    if (!result.ok) {
      // REQ-DPPMB-CTRL-06: surface INVALID_STATE_TRANSITION as inline error.
      setError(result.error ?? 'Esta transición no es válida para el estado actual.');
    }
  }

  // ------ Cancel confirm flow -------

  if (showCancelConfirm) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-sans text-sm text-ink">
          ¿Cancelar la sesión? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <Button
            tone="ghost"
            size="sm"
            onClick={() => setShowCancelConfirm(false)}
            disabled={pending}
          >
            Volver
          </Button>
          <Button
            tone="cta"
            size="sm"
            disabled={pending}
            onClick={() =>
              handleTransition(async () => {
                const res = await cancelSession(sessionId, campaignId);
                if (res.ok) setShowCancelConfirm(false);
                return res;
              })
            }
          >
            {pending ? 'Cancelando…' : 'Confirmar'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="font-sans text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ------ CompleteForm overlay -------

  const activeParticipants = participants.filter((p) => p.leftAt === null) as EnrichedParticipant[];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* ── scheduled ── */}
        {status === 'scheduled' && (
          <Button
            tone="green"
            size="sm"
            disabled={pending}
            onClick={() =>
              handleTransition(() => startSession(sessionId, campaignId))
            }
          >
            {pending ? 'Iniciando…' : 'Iniciar'}
          </Button>
        )}

        {/* ── active ── */}
        {status === 'active' && (
          <Button
            tone="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              handleTransition(() => pauseSession(sessionId, campaignId))
            }
          >
            {pending ? 'Pausando…' : 'Pausar'}
          </Button>
        )}

        {/* ── paused ── */}
        {status === 'paused' && (
          <Button
            tone="green"
            size="sm"
            disabled={pending}
            onClick={() =>
              handleTransition(() => resumeSession(sessionId, campaignId))
            }
          >
            {pending ? 'Reanudando…' : 'Reanudar'}
          </Button>
        )}

        {/* ── active or paused: Completar ── REQ-DPPMB-CTRL-04 ── */}
        {(status === 'active' || status === 'paused') && (
          <Button
            tone="cta"
            size="sm"
            disabled={pending}
            onClick={() => setShowCompleteForm(true)}
          >
            Completar sesión
          </Button>
        )}

        {/* ── Cancelar (all non-terminal states) ── */}
        <Button
          tone="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setShowCancelConfirm(true)}
        >
          Cancelar
        </Button>

        {error && (
          <p role="alert" className="w-full font-sans text-xs text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* ── CompleteForm sheet — REQ-DPPMB-COMPLETE-02 ── */}
      <CompleteForm
        open={showCompleteForm}
        onClose={() => setShowCompleteForm(false)}
        onDone={() => setShowCompleteForm(false)}
        sessionId={sessionId}
        campaignId={campaignId}
        participants={activeParticipants}
      />
    </>
  );
}
