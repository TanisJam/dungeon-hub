import type { DMCampaignNextSession } from '../types';
import { Pill } from '@/components/ui/pill';

interface DMNextSessionCardProps {
  campaign: DMCampaignNextSession;
}

/**
 * DMNextSessionCard — DM view of the next campaign session.
 *
 * Shows campaign name, player count, and session number.
 * tagline and pendingQuests have no backend source — rendered only when provided.
 * The "Dirigís" pill is absolutely positioned to mark DM identity.
 *
 * REQ-IDM-NEXT-SESSION-CARD-04
 */
export function DMNextSessionCard({ campaign }: DMNextSessionCardProps) {
  const { name, tagline, players, pendingQuests, sessions } = campaign;

  return (
    <div className="inicio-camp-dm-bg relative rounded-2xl p-4 overflow-hidden">
      {/* DM role pill — absolute positioned */}
      {/* FLAG: original text-ink (#F4EAD5 light) on bg-secondary (magenta). Atom solid secondary uses
           text-on-secondary (#1A1208 dark). DIFFERENT — dark ink vs light cream. Human sign-off needed. */}
      {/* NORM: font-bold→font-medium (atom base); 11px→10px (sm); uppercase+tracking preserved via className */}
      <Pill
        tone="secondary"
        fill="solid"
        size="sm"
        className="absolute top-3 right-3 uppercase tracking-widest"
      >
        Dirigís
      </Pill>

      {/* Campaign title */}
      <h2 className="font-display font-bold text-[19px] leading-tight tracking-tight text-ink pr-16 mt-1">
        {name}
      </h2>

      {/* Tagline — optional; no backend field */}
      {tagline && (
        <p className="font-script text-sm text-ink-mute mt-0.5 mb-4">
          {tagline}
        </p>
      )}

      {/* Stats pills row */}
      <div className="flex gap-2 flex-wrap mt-4">
        <span className="px-2.5 py-0.5 rounded-full bg-surface-raised text-xs font-semibold text-ink">
          {players} jugadores
        </span>
        {pendingQuests !== undefined && (
          <span className="px-2.5 py-0.5 rounded-full bg-surface-raised text-xs font-semibold text-ink">
            {pendingQuests} quests activas
          </span>
        )}
        <span className="px-2.5 py-0.5 rounded-full bg-surface-raised text-xs font-semibold text-ink">
          Sesión {sessions + 1}
        </span>
      </div>
    </div>
  );
}
