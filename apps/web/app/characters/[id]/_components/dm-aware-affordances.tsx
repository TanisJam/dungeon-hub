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
  const [clientRole] = useRole();

  // isDmMode: only true when the server confirmed GM role AND client selected 'dm'.
  // A non-GM player can never reach isDmMode=true.
  const isDmMode = serverCallerRole === 'gm' && clientRole === 'dm';

  return (
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
}

