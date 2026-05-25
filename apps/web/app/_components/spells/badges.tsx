/**
 * Shared R/C/M spell badge chips.
 * SP-04: extracted from _picker.tsx (lines 647+714) to avoid duplication.
 * Used by: SpellRow in _picker.tsx, spell rows in hechizos.tsx.
 */

interface SpellBadgesProps {
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  /** Unused in rendering but kept for symmetry with SpellSheetRef shape. */
  componentsMCost?: number | null;
}

export function SpellBadges({ ritual, concentration, componentsM }: SpellBadgesProps) {
  if (!ritual && !concentration && !componentsM) return null;
  return (
    <>
      {ritual && (
        <span
          className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          title="Ritual"
        >
          R
        </span>
      )}
      {concentration && (
        <span
          className="rounded bg-blue-100 px-1 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          title="Concentración"
        >
          C
        </span>
      )}
      {componentsM && (
        <span
          className="rounded bg-purple-100 px-1 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
          title="Componente material"
        >
          M
        </span>
      )}
    </>
  );
}
