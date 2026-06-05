'use client';

// SessionList — vertical stack of SessionCards with DM FAB, create sheet,
//               join bottom-sheet, and leave confirmation.
// REQ-DPPMB-LIST-04, REQ-DPPMB-JOIN-01, REQ-DPPMB-LEAVE-02, REQ-DPPMB-CT-01.
// ADR-B3: SessionList is 'use client'; receives serializable props from the
//         Server Component page (ADR-B3: RSC boundary).
// B2.2: DM FAB wired to SessionCreateForm inside V3Sheet.
// B3.2: join sheet + leave confirm wired here.

import { useState } from 'react';
import { SectionHead } from '@/components/ui/section-head';
import { V3Empty } from '@/components/ui/empty';
import { V3Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SessionCard } from './session-card';
import { SessionCreateForm } from './session-create-form';
import { JoinSheet } from './join-sheet';
import { leaveSession } from '@/app/campanas/[id]/sessions/actions';
import type { CampanaSessionRow } from '@/components/campanas/campana-detail-view';
import type { RosterCharacter } from './join-sheet';

export interface SessionListProps {
  campaignId: string;
  worldId: string;
  sessions: CampanaSessionRow[];
  /** callerRole='gm' shows DM FAB; 'player' shows join affordances */
  callerRole: 'gm' | 'player';
  activeParticipantCharIds: string[];
  /** Active characters the caller owns in this world — fed into the join sheet. */
  callerCharacters: RosterCharacter[];
  /** Called when the DM taps the FAB. Wired to the create sheet in B2. */
  onCreateRequest?: () => void;
  /** Called when a player taps "Unirme". Wired to the join sheet in B3. */
  onJoinRequest?: (sessionId: string) => void;
  /** Called when a player taps "Salir". Wired to leave confirmation in B3. */
  onLeaveRequest?: (sessionId: string, characterId: string) => void;
}

export function SessionList({
  campaignId,
  worldId: _worldId,
  sessions,
  callerRole,
  activeParticipantCharIds,
  callerCharacters,
  onCreateRequest,
  onJoinRequest,
  onLeaveRequest,
}: SessionListProps) {
  const isDm = callerRole === 'gm';

  // B2.2 — create sheet state
  const [showCreate, setShowCreate] = useState(false);

  // B3.2 — join sheet state
  const [joinSessionId, setJoinSessionId] = useState<string | null>(null);

  // B3.2 — leave confirmation state: holds { sessionId, characterId } while confirm is shown
  const [leaveTarget, setLeaveTarget] = useState<{
    sessionId: string;
    characterId: string;
  } | null>(null);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // B3.2 — join handler wired from SessionCard.onJoinRequest
  function handleJoinRequest(sessionId: string) {
    setJoinSessionId(sessionId);
    onJoinRequest?.(sessionId);
  }

  // B3.2 — leave handler wired from SessionCard.onLeaveRequest
  function handleLeaveRequest(sessionId: string, characterId: string) {
    setLeaveTarget({ sessionId, characterId });
    setLeaveError(null);
    onLeaveRequest?.(sessionId, characterId);
  }

  async function handleLeaveConfirm() {
    if (!leaveTarget) return;
    setLeaveSubmitting(true);
    setLeaveError(null);

    const result = await leaveSession(leaveTarget.sessionId, leaveTarget.characterId, campaignId);
    setLeaveSubmitting(false);

    if (result.ok) {
      setLeaveTarget(null);
    } else {
      // REQ-DPPMB-LEAVE-04: 403 = no permission
      if (result.status === 403) {
        setLeaveError('No tenés permiso para salir de esta sesión.');
      } else {
        setLeaveError(result.error ?? 'No se pudo salir de la sesión. Intentá de nuevo.');
      }
    }
  }

  return (
    <section className="relative">
      {/* B2.2 — Create-session V3Sheet (DM only) */}
      {isDm && (
        <V3Sheet
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title="Nueva sesión"
        >
          <SessionCreateForm
            campaignId={campaignId}
            onDone={() => setShowCreate(false)}
          />
        </V3Sheet>
      )}

      {/* B3.2 — Join bottom-sheet (player and DM-as-player) */}
      <JoinSheet
        open={joinSessionId !== null}
        onClose={() => setJoinSessionId(null)}
        sessionId={joinSessionId ?? ''}
        campaignId={campaignId}
        characters={callerCharacters}
      />

      {/* B3.2 — Leave confirmation sheet (REQ-DPPMB-LEAVE-02: explicit confirmation) */}
      <V3Sheet
        open={leaveTarget !== null}
        onClose={() => {
          setLeaveTarget(null);
          setLeaveError(null);
        }}
        title="Salir de la sesión"
      >
        <div className="flex flex-col gap-4">
          <p className="font-sans text-sm text-ink">
            ¿Salir de la sesión? Tu personaje será removido.
          </p>
          {leaveError && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {leaveError}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              tone="ghost"
              fullWidth
              onClick={() => {
                setLeaveTarget(null);
                setLeaveError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              tone="cta"
              fullWidth
              disabled={leaveSubmitting}
              onClick={handleLeaveConfirm}
            >
              {leaveSubmitting ? 'Saliendo…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </V3Sheet>

      <SectionHead title="Sesiones" meta={sessions.length} />

      {sessions.length === 0 ? (
        <div className="mt-2">
          <V3Empty
            glyph="dice"
            title="No hay sesiones aún"
            sub={isDm ? 'Creá la primera sesión de tu campaña.' : undefined}
            cta={
              isDm
                ? undefined // DM uses FAB, not inline CTA
                : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              campaignId={campaignId}
              session={s}
              activeParticipantCharIds={activeParticipantCharIds}
              onJoinRequest={handleJoinRequest}
              onLeaveRequest={handleLeaveRequest}
            />
          ))}
        </ul>
      )}

      {/* REQ-DPPMB-LIST-04: DM FAB — fixed bottom-right, gate on callerRole==='gm'.
          B2.2: onClick opens the create-session V3Sheet.
          md: becomes an inline header button per the design. */}
      {isDm && (
        <button
          type="button"
          aria-label="Nueva sesión"
          onClick={() => {
            setShowCreate(true);
            onCreateRequest?.();
          }}
          className={[
            'fixed bottom-20 right-4 z-40',
            'flex h-14 w-14 items-center justify-center',
            'rounded-full bg-gradient-to-br from-accent to-secondary text-white',
            'shadow-[0_4px_20px_rgba(232,148,111,0.4),0_1px_4px_rgba(39,30,51,0.12)]',
            'active:scale-95 transition-transform',
            'md:relative md:bottom-auto md:right-auto md:h-auto md:w-auto',
            'md:flex md:items-center md:gap-1.5 md:rounded-[10px] md:px-3 md:py-2',
            'md:text-sm md:font-bold md:shadow-none',
          ].join(' ')}
        >
          <Icon name="plus" size={20} />
          <span className="sr-only md:not-sr-only">Nueva sesión</span>
        </button>
      )}
    </section>
  );
}
