import { SectionHead } from '@/components/ui/section-head';
import { Pill } from '@/components/ui/pill';
import type { CampaignDetail, CampaignMemberRole } from './types';
import { InviteAffordance } from './_invite-affordance';
import { SessionList } from '@/components/campanas/sessions/session-list';
import type { RosterCharacter } from '@/components/campanas/sessions/join-sheet';

// REQ-DPPMB-LIST-01: CampanaSessionRow extended with session fields for the play-loop UI.
export type SessionParticipantRef = {
  characterId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
};

export type CampanaSessionRow = {
  id: string;
  title: string;
  status: 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
  scheduledAt: string | null;
  // REQ-DPPMB-LIST-01: added in Slice B
  levelMin: number | null;
  levelMax: number | null;
  maxPlayers: number | null;
  currentPlayers: number;
  participants: SessionParticipantRef[];
};

type Props = {
  detail: CampaignDetail;
  sessions: CampanaSessionRow[];
  callerUserId: string;
  worldId: string;
  /** Active characters the caller owns in this world — passed to SessionList → JoinSheet. */
  callerCharacters: RosterCharacter[];
};

const ROLE_LABEL: Record<CampaignMemberRole, string> = {
  gm: 'DM',
  player: 'Jugador',
};
const ROLE_TONE: Record<CampaignMemberRole, 'accent' | 'stone'> = {
  gm: 'accent',
  player: 'stone',
};

export function CampanaDetailView({ detail, sessions, callerUserId, worldId, callerCharacters }: Props) {
  // Derive the set of character IDs that the caller is an ACTIVE participant in
  // (leftAt IS NULL, userId matches the caller). Passed into SessionList so each
  // SessionCard can render the correct affordance without additional fetches.
  // REQ-DPPMB-LIST-08.
  const activeParticipantCharIds = sessions.flatMap((s) =>
    s.participants
      .filter((p) => p.userId === callerUserId && p.leftAt === null)
      .map((p) => p.characterId),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink">{detail.name}</h1>
        {detail.tagline ? (
          <p data-testid="campana-tagline" className="font-script text-sm text-ink-soft">
            {detail.tagline}
          </p>
        ) : null}
      </header>

      <section>
        <SectionHead title="Miembros" meta={detail.members.length} />
        <ul className="mt-2 flex flex-col gap-1.5">
          {detail.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-md bg-surface-raised px-3 py-2"
            >
              <span className="font-sans text-sm font-semibold text-ink">{m.username}</span>
              <Pill size="sm" tone={ROLE_TONE[m.role]}>
                {ROLE_LABEL[m.role]}
              </Pill>
            </li>
          ))}
        </ul>
        {detail.callerRole === 'gm' && <InviteAffordance campaignId={detail.id} />}
      </section>

      <SessionList
        campaignId={detail.id}
        worldId={worldId}
        sessions={sessions}
        callerRole={detail.callerRole ?? 'player'}
        activeParticipantCharIds={activeParticipantCharIds}
        callerCharacters={callerCharacters}
      />
    </div>
  );
}
