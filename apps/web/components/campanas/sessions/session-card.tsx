'use client';

// SessionCard — one session row on the campaign detail list.
// REQ-DPPMB-LIST-02, REQ-DPPMB-LIST-03, REQ-DPPMB-LIST-05,
// REQ-DPPMB-LIST-06, REQ-DPPMB-LIST-07, REQ-DPPMB-LIST-09.

import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import type { CampanaSessionRow } from '@/components/campanas/campana-detail-view';

type SessionStatus = CampanaSessionRow['status'];

const STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: 'Programada',
  active: 'En curso',
  paused: 'Pausada',
  completed: 'Jugada',
  cancelled: 'Cancelada',
};

const STATUS_TONE: Record<SessionStatus, 'primary' | 'secondary' | 'stone' | 'amber'> = {
  scheduled: 'amber',
  active: 'primary',
  paused: 'stone',
  completed: 'primary',
  cancelled: 'stone',
};

const TERMINAL_STATUSES: SessionStatus[] = ['completed', 'cancelled'];

const SHORT_DATE = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export interface SessionCardProps {
  campaignId: string;
  session: CampanaSessionRow;
  /** Character IDs that the calling user is actively participating in (leftAt IS NULL). */
  activeParticipantCharIds: string[];
  /** Called when the user taps "Unirme". Wired to the join bottom-sheet in B3. */
  onJoinRequest?: (sessionId: string) => void;
  /** Called when the user confirms "Salir". Wired to the leave confirmation in B3. */
  onLeaveRequest?: (sessionId: string, characterId: string) => void;
}

export function SessionCard({
  campaignId,
  session,
  activeParticipantCharIds,
  onJoinRequest,
  onLeaveRequest,
}: SessionCardProps) {
  const isTerminal = TERMINAL_STATUSES.includes(session.status);

  // Derive whether this session has an active character belonging to the caller.
  // Guard: participants may be absent on the list endpoint (only present on detail).
  const participatingCharId = (session.participants ?? []).find(
    (p) => activeParticipantCharIds.includes(p.characterId) && p.leftAt === null,
  )?.characterId;
  const isParticipating = Boolean(participatingCharId);

  const detailHref = `/campanas/${campaignId}/sessions/${session.id}`;

  return (
    <li className="flex flex-col gap-2 rounded-md bg-surface-raised px-3 py-2">
      {/* Row 1: title + status pill */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={detailHref}
          className="min-w-0 flex-1 truncate font-sans text-sm font-semibold text-ink min-h-[44px] flex items-center"
        >
          {session.title}
        </Link>
        <Pill size="sm" tone={STATUS_TONE[session.status]}>
          {STATUS_LABEL[session.status]}
        </Pill>
      </div>

      {/* Row 2: secondary meta (date, slots, level range) */}
      <div className="flex flex-wrap items-center gap-2 font-sans text-xs text-ink-mute">
        {session.scheduledAt && (
          <span>{SHORT_DATE.format(new Date(session.scheduledAt))}</span>
        )}
        {session.maxPlayers !== null && (
          <span>{session.currentPlayers}/{session.maxPlayers}</span>
        )}
        {session.levelMin !== null && session.levelMax !== null && (
          <span>Nv {session.levelMin}–{session.levelMax}</span>
        )}
      </div>

      {/* Row 3: action affordances — hidden for terminal sessions */}
      {!isTerminal && (
        <div className="flex items-center gap-2">
          {isParticipating ? (
            <>
              {/* REQ-DPPMB-LIST-06: En sesión chip + Salir */}
              <Pill tone="accent" size="sm">En sesión</Pill>
              <Button
                tone="ghost"
                size="sm"
                onClick={() => {
                  if (participatingCharId) {
                    onLeaveRequest?.(session.id, participatingCharId);
                  }
                }}
              >
                Salir
              </Button>
            </>
          ) : (
            /* REQ-DPPMB-LIST-05: Unirme on joinable sessions */
            <Button
              tone="green"
              size="sm"
              onClick={() => onJoinRequest?.(session.id)}
            >
              Unirme
            </Button>
          )}
          {/* Ver link always present for non-terminal sessions */}
          <Link
            href={detailHref}
            className="ml-auto font-sans text-xs font-medium text-primary underline-offset-2 hover:underline min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            Ver
          </Link>
        </div>
      )}

      {/* Terminal sessions still get a "Ver" link (REQ-DPPMB-LIST-09) */}
      {isTerminal && (
        <div className="flex">
          <Link
            href={detailHref}
            className="ml-auto font-sans text-xs font-medium text-primary underline-offset-2 hover:underline min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            Ver
          </Link>
        </div>
      )}
    </li>
  );
}
