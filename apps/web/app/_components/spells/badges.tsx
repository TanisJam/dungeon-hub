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
          className="rounded-sm bg-warning-soft px-1 text-[10px] font-bold text-warning"
          title="Ritual"
        >
          R
        </span>
      )}
      {concentration && (
        <span
          className="rounded-sm bg-arcane/10 px-1 text-[10px] font-bold text-arcane"
          title="Concentración"
        >
          C
        </span>
      )}
      {componentsM && (
        <span
          className="rounded-sm bg-secondary-soft px-1 text-[10px] font-bold text-secondary"
          title="Componente material"
        >
          M
        </span>
      )}
    </>
  );
}
