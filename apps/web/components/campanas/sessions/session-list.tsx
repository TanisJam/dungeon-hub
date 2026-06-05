'use client';

// SessionList — vertical stack of SessionCards with DM FAB and empty state.
// REQ-DPPMB-LIST-04, REQ-DPPMB-CT-01.
// ADR-B3: SessionList is 'use client'; receives serializable props from the
//         Server Component page (ADR-B3: RSC boundary).
// B2.2: DM FAB wired to SessionCreateForm inside V3Sheet.

import { useState } from 'react';
import { SectionHead } from '@/components/ui/section-head';
import { V3Empty } from '@/components/ui/empty';
import { V3Sheet } from '@/components/ui/sheet';
import { Icon } from '@/components/ui/icon';
import { SessionCard } from './session-card';
import { SessionCreateForm } from './session-create-form';
import type { CampanaSessionRow } from '@/components/campanas/campana-detail-view';

export interface SessionListProps {
  campaignId: string;
  worldId: string;
  sessions: CampanaSessionRow[];
  /** callerRole='gm' shows DM FAB; 'player' shows join affordances */
  callerRole: 'gm' | 'player';
  activeParticipantCharIds: string[];
  /** Called when the DM taps the FAB. Wired to the create sheet in B2. */
  onCreateRequest?: () => void;
  /** Called when a player taps "Unirme". Wired to the join sheet in B3. */
  onJoinRequest?: (sessionId: string) => void;
  /** Called when a player taps "Salir". Wired to leave confirmation in B3. */
  onLeaveRequest?: (sessionId: string, characterId: string) => void;
}

export function SessionList({
  campaignId,
  sessions,
  callerRole,
  activeParticipantCharIds,
  onCreateRequest,
  onJoinRequest,
  onLeaveRequest,
}: SessionListProps) {
  const isDm = callerRole === 'gm';

  // B2.2 — create sheet state; controlled here (not via onCreateRequest prop from parent)
  const [showCreate, setShowCreate] = useState(false);

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
              onJoinRequest={onJoinRequest}
              onLeaveRequest={onLeaveRequest}
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
