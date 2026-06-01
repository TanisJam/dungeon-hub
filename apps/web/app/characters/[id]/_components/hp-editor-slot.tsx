'use client';

/**
 * HpEditorSlot — renders the HP pencil edit affordance reactively.
 *
 * FIX B (HP part): the isDmHere prop passed to HPSectionEditor must reflect
 * the EFFECTIVE DM mode (serverCallerRole=gm AND clientRole=dm), not just
 * the server-side callerRole. This ensures:
 * - GM in player-mode: HP editor shows (isOwner) but DM Override badge hidden
 * - GM in dm-mode: HP editor shows + DM Override badge + max field editable
 * - Non-GM owner: HP editor shows, max read-only (isOwner = true, isDmMode = false)
 *
 * The component is rendered inside the VitalGrid HP cell as hpEditorSlot.
 */

import { useRole } from '@/lib/use-role';
import { HPSectionEditor } from '@/components/ficha/hp/hp-section-editor';
import type { HpValues } from '@/components/ficha/hp/hp-editor';

type CallerRole = 'gm' | 'player' | null;

interface HpEditorSlotProps {
  serverCallerRole: CallerRole;
  isOwner: boolean;
  characterId: string;
  currentHp: HpValues;
}

export function HpEditorSlot({
  serverCallerRole,
  isOwner,
  characterId,
  currentHp,
}: HpEditorSlotProps) {
  const [clientRole] = useRole();

  const isDmMode = serverCallerRole === 'gm' && clientRole === 'dm';
  const showEditor = isOwner || isDmMode;

  if (!showEditor) return null;

  return (
    <div className="absolute top-1 right-1">
      <HPSectionEditor
        characterId={characterId}
        currentHp={currentHp}
        isDmHere={isDmMode}
      />
    </div>
  );
}
