/**
 * LevelUpEntryPoint — "Subir nivel" pill on the character sheet.
 *
 * Visibility rules (REQ-CLU-UI-ENTRY):
 *   - Only shown when character is 'active'
 *   - Only shown to the owner (callerRole !== 'gm' at this point is player|null;
 *     the actual owner check is done by the API; here we show to non-gm members)
 *   - Only shown when character has enough XP for the next total level
 *     (xp >= XP_TABLE[totalLevel] — i.e., canReachLevel(xp, totalLevel+1) passes)
 *
 * SDD multiclass-class-step (spec #878).
 */

import Link from 'next/link';

interface LevelUpEntryPointProps {
  characterId: string;
  status: string;
  /** Total level across all classes. */
  totalLevel: number;
  /** Current XP. */
  xp: number;
  /** Caller role in this world. */
  callerRole: 'gm' | 'player' | null;
}

// XP required to REACH each level (same as the API/domain table, PHB p.15).
// Index i → XP needed to be level (i+1). Level 1 = 0 XP.
const XP_TABLE = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= 20) return XP_TABLE[19];
  return XP_TABLE[level - 1];
}

export function LevelUpEntryPoint({
  characterId,
  status,
  totalLevel,
  xp,
  callerRole,
}: LevelUpEntryPointProps) {
  // Only active, non-GM callers (i.e. owners) who have enough XP.
  if (status !== 'active') return null;
  if (callerRole === 'gm') return null;
  if (totalLevel >= 14) return null; // MVP level cap

  const xpNeeded = xpForLevel(totalLevel + 1);
  if (xp < xpNeeded) return null;

  return (
    <Link
      href={`/characters/${characterId}/level-up`}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper hover:bg-primary-deep transition-colors"
      aria-label="Subir de nivel"
    >
      ✦ Subir nivel
    </Link>
  );
}
