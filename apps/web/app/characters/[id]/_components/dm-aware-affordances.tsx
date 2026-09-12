'use client';

/**
 * DmAwareAffordances — client wrapper that gates DM affordances on effective DM mode.
 *
 * "Effective DM mode" = serverCallerRole === 'gm' AND clientRole === 'dm'.
 * A real player (callerRole !== 'gm') is NEVER in DM mode regardless of toggle.
 * A GM who toggled to "player" switches out of DM mode, hiding all DM affordances.
 *
 * FIX B: REQ-ROLE-EFFECTIVE-01 — DM affordances are reactive to the role switcher.
 * Previously they were gated only on the SSR callerRole and never changed client-side.
 */

import { useRole } from '@/lib/use-role';
import { ApprovalActions } from './approval-actions';
import { DmGrantPanel } from './dm-grant-panel';

type CallerRole = 'gm' | 'player' | null;
type CharacterStatus = 'draft' | 'pending_approval' | 'active' | 'retired' | 'dead';

interface DmAwareAffordancesProps {
  /** Server-side resolved caller role (authoritative). */
  serverCallerRole: CallerRole;
  /** Character data for DM actions. */
  characterId: string;
  characterName: string;
  worldId: string;
  status: CharacterStatus;
}

/**
 * DmAwareAffordances — renders ApprovalActions + DmGrantPanel gated on isDmMode.
 * All DM controls disappear when the GM toggles the role switcher to "player".
 */
export function DmAwareAffordances({
  serverCallerRole,
  characterId,
  characterName,
  worldId,
  status,
}: DmAwareAffordancesProps) {
  // GMs default to 'dm' mode so DM affordances are visible on first load.
  // A real player (serverCallerRole !== 'gm') defaults to 'player' (no DM mode possible).
  const defaultRole = serverCallerRole === 'gm' ? 'dm' : 'player';
  const [clientRole] = useRole(defaultRole);

  // isDmMode: only true when the server confirmed GM role AND client selected 'dm'.
  // A non-GM player can never reach isDmMode=true.
  const isDmMode = serverCallerRole === 'gm' && clientRole === 'dm';

  const affordances = (
    <>
      {/* Approval actions — only visible in DM mode */}
      <ApprovalActions
        characterId={characterId}
        callerRole={isDmMode ? 'gm' : null}
        status={status}
      />

      {/* DM grant panel — only visible in DM mode */}
      <DmGrantPanel
        characterId={characterId}
        characterName={characterName}
        callerRole={isDmMode ? 'gm' : null}
        worldId={worldId}
      />
    </>
  );

  // Outside DM mode both children gate themselves to null, so render them bare
  // and change nothing for a player.
  if (!isDmMode) return affordances;

  /*
   * Audit F8: the sheet stacked "Descanso corto / largo", "Devolver a borrador"
   * and "Otorgar" at equal weight, and pushed the tabs 131px below the fold at
   * 375px. Two of those are a player's frequent actions; the other two belong to
   * a different role and one of them is destructive.
   *
   * Grouping them under a collapsed "Como DM" gives the sheet one primary
   * surface again and stops a destructive action sitting one stray tap from the
   * rest controls — without hiding it behind a menu a DM would have to learn.
   *
   * <details> rather than useState: the disclosure is keyboard-operable and
   * screen-reader-labelled for free, and it works before hydration.
   */
  return (
    <details className="group rounded-md border border-line bg-surface/40">
      <summary
        className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-eyebrow text-ink-mute [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-150 group-open:rotate-90"
        >
          ›
        </span>
        Como DM
      </summary>
      <div className="space-y-3 px-3 pb-3">{affordances}</div>
    </details>
  );
}

