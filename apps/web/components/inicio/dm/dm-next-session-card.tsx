import type { DMCampaignNextSession } from '../dm-mock-data';

interface DMNextSessionCardProps {
  campaign: DMCampaignNextSession;
}

/**
 * DMNextSessionCard — DM view of the next campaign session.
 *
 * Shows campaign name, tagline, player count, quest count, and session number.
 * The "Dirigís" pill is absolutely positioned to mark DM identity.
 *
 * REQ-IDM-NEXT-SESSION-CARD-04
 */
export function DMNextSessionCard({ campaign }: DMNextSessionCardProps) {
  const { name, tagline, players, pendingQuests, sessions } = campaign;

  return (
    <div className="inicio-camp-dm-bg relative rounded-2xl p-4 overflow-hidden">
      {/* DM role pill — absolute positioned */}
      <span className="inicio-camp-dm-role-pill absolute top-3 right-3 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest rounded-full">
        Dirigís
      </span>

      {/* Campaign title */}
      <h2 className="font-display font-bold text-[19px] leading-tight tracking-tight text-ink pr-16 mt-1">
        {name}
      </h2>

      {/* Tagline */}
      <p className="font-script text-sm text-ink-mute mt-0.5 mb-4">
        {tagline}
      </p>

      {/* Stats pills row */}
      <div className="flex gap-2 flex-wrap">
        <span className="px-2.5 py-0.5 rounded-full bg-surface-raised text-xs font-semibold text-ink">
          {players} jugadores
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-surface-raised text-xs font-semibold text-ink">
          {pendingQuests} quests activas
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-surface-raised text-xs font-semibold text-ink">
          Sesión {sessions + 1}
        </span>
      </div>
    </div>
  );
}
