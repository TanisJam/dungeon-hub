'use client';

// SessionDetailView — header + participants + event timeline + DmControls slot.
// REQ-DPPMB-DETAIL-03, REQ-DPPMB-DETAIL-04, REQ-DPPMB-DETAIL-05, REQ-DPPMB-DETAIL-06, REQ-DPPMB-DETAIL-07.
// ADR-B3: 'use client' wrapper receiving serializable props; page (RSC) does the fetch.
// 375px single-column; md: two-column (participants sidebar + timeline).
// DmControls slot: B5 wires the actual <DmControls> into this slot.

import type { ReactNode } from 'react';
import type { SessionDetail, SessionEvent } from '@/app/campanas/[id]/sessions/actions';
import { Pill } from '@/components/ui/pill';
import { SectionHead } from '@/components/ui/section-head';
import { EventTimeline } from './event-timeline';

// ---------------------------------------------------------------------------
// Status maps (mirrored from session-card.tsx — ADR-B6: accepted duplication of shape)
// ---------------------------------------------------------------------------

type SessionStatus = SessionDetail['status'];

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

// ---------------------------------------------------------------------------
// Date formatter (es-AR)
// ---------------------------------------------------------------------------

const SHORT_DATE = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SessionDetailViewProps {
  detail: SessionDetail;
  events: SessionEvent[];
  /** Access level derived by the page from the session payload (presence of dmNotes = gm). */
  accessLevel: 'gm' | 'participant' | 'campaign-member';
  campaignId: string;
  /** GM display name — resolved from campaign members on the page. */
  gmName: string;
  /**
   * DmControls slot — B5 wires <DmControls> here.
   * When provided, rendered in a sticky bottom bar container.
   * When undefined, nothing is rendered (no empty container).
   *
   * CONTRACT FOR B5:
   *   - Pass accessLevel + sessionId + campaignId + current status to <DmControls>.
   *   - The sticky bar wrapping is owned by SessionDetailView (keeps layout responsibility here).
   *   - DmControls is a 'use client' island; it receives status as a prop.
   */
  dmControlsSlot?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionDetailView({
  detail,
  events,
  accessLevel,
  gmName,
  dmControlsSlot,
}: SessionDetailViewProps) {
  const isGm = accessLevel === 'gm';

  // Determine which participants to show:
  // - GM: all participants (active + left) with "Salió" indicator for left ones
  // - others: only active participants (leftAt === null)
  const visibleParticipants = isGm
    ? detail.participants
    : detail.participants.filter((p) => p.leftAt === null);

  return (
    <div className="flex flex-col gap-6 pb-28">
      {/* ── Header (REQ-DPPMB-DETAIL-03) ── */}
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 font-display text-xl font-bold text-ink leading-tight">
            {detail.title}
          </h1>
          <Pill tone={STATUS_TONE[detail.status]} size="md">
            {STATUS_LABEL[detail.status]}
          </Pill>
        </div>

        <div className="flex flex-wrap gap-3 font-sans text-xs text-ink-mute">
          {detail.scheduledAt && (
            <span data-testid="session-scheduled-at">
              {SHORT_DATE.format(new Date(detail.scheduledAt))}
            </span>
          )}
          {detail.levelMin !== null && detail.levelMax !== null && (
            <span>Nv {detail.levelMin}–{detail.levelMax}</span>
          )}
          {detail.maxPlayers !== null && (
            <span>
              {detail.participants.filter((p) => p.leftAt === null).length}/{detail.maxPlayers} jugadores
            </span>
          )}
        </div>

        <p className="font-sans text-xs text-ink-mute">
          DM: <span className="font-medium text-ink">{gmName}</span>
        </p>
      </header>

      {/* ── Main content: single-column on 375px; md: two-column ── */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-6">
        {/* ── Participants (REQ-DPPMB-DETAIL-04, REQ-DPPMB-DETAIL-06) ── */}
        <section className="md:w-56 md:shrink-0">
          <SectionHead title="Participantes" meta={visibleParticipants.length} />
          {visibleParticipants.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-ink-mute">
              Aún no hay participantes.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {visibleParticipants.map((p) => {
                const hasLeft = p.leftAt !== null;
                return (
                  <li
                    key={p.characterId}
                    className={[
                      'flex flex-col gap-0.5 rounded-md px-3 py-2',
                      hasLeft
                        ? 'bg-paper-soft opacity-60'
                        : 'bg-surface-raised',
                    ].join(' ')}
                  >
                    <span className="font-sans text-sm font-semibold text-ink">
                      {p.name}
                    </span>
                    <span className="font-sans text-xs text-ink-mute">
                      Nv {p.level}{p.lineage ? ` · ${p.lineage}` : ''}
                    </span>
                    {/* REQ-DPPMB-DETAIL-04: "Salió" indicator for GM */}
                    {hasLeft && isGm && (
                      <span className="mt-0.5 font-sans text-[10px] font-medium text-ink-soft">
                        Salió
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Event timeline (REQ-DPPMB-DETAIL-05, REQ-DPPMB-DETAIL-06) ── */}
        <section className="flex-1">
          <SectionHead title="Eventos" />
          <div className="mt-2">
            <EventTimeline events={events} />
          </div>
        </section>
      </div>

      {/* ── DmControls slot — B5 wires <DmControls> here (REQ-DPPMB-CTRL-01) ── */}
      {dmControlsSlot != null && (
        <div
          data-testid="dm-controls-slot"
          className="fixed inset-x-0 bottom-16 z-10 border-t border-line bg-surface px-4 py-3"
        >
          {dmControlsSlot}
        </div>
      )}
    </div>
  );
}
