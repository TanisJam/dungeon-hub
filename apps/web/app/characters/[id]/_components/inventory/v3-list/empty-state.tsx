/**
 * EmptyState — per-filter empty card for the v3 inventory list.
 *
 * Client Component (accepts onAdd callback for the CTA button).
 * Reqs: WIVLS-EMPTY-01 (spec #1063), WID4-CHIPS-01 (spec #1077)
 * Design: DA9 (Slice A — Libros/Quest deferred); DCE4 (Slice C — book/quest enabled).
 *
 * a11y: CTA is a real <button> (not a <p role="button">) with a DISTINCT accessible name
 * from the top-level "+ Agregar ítem" Picker button. REQ-INV-A11Y-SINGLE-CTA.
 */
'use client';

import type { V3ItemType } from '@/lib/sheet-types';

type FilterKey = V3ItemType | 'all';

interface EmptyStateProps {
  filter: FilterKey;
  /** Called when the user taps the CTA button. Wire to the Picker's open handler. */
  onAdd?: () => void;
}

const EMPTY_COPY: Record<string, { title: string; cta: string | null }> = {
  weapon:     { title: 'Sin armas en el inventario', cta: 'Agregá tu primer arma' },
  armor:      { title: 'Sin armadura en el inventario', cta: 'Agregá tu primera armadura' },
  magic:      { title: 'Sin ítems mágicos', cta: 'Agregá tu primer ítem mágico' },
  consumable: { title: 'Sin consumibles', cta: 'Agregá tu primer consumible' },
  food:       { title: 'Sin comida ni provisiones', cta: 'Agregá provisiones' },
  trinket:    { title: 'Sin baratijas ni miscelláneos', cta: 'Agregá una baratija' },
  // DCE4 (Slice C): book + quest are now enabled — real copy replaces "Próximamente"
  book:       { title: 'Sin libros en el inventario', cta: 'Agregá tu primer libro' },
  quest:      { title: 'Sin objetos de quest activos', cta: null },
  all:        { title: 'Tu inventario está vacío', cta: 'Agregá tu primer ítem' },
};

/** Fires a bubbling custom event that the Picker listens for to open itself. */
function handleOpenPicker(onAdd?: () => void) {
  if (onAdd) {
    onAdd();
    return;
  }
  // Fallback: fire custom event so the Picker sibling can react without prop drilling.
  document.dispatchEvent(new CustomEvent('dh:inventory:open-picker'));
}

export function EmptyState({ filter, onAdd }: EmptyStateProps) {
  const copy = EMPTY_COPY[filter] ?? EMPTY_COPY['all']!;

  return (
    <div className="inventory-init-empty">
      <p className="ttl">{copy.title}</p>
      {copy.cta && (
        <button
          type="button"
          onClick={() => handleOpenPicker(onAdd)}
          className="cta min-h-[44px] px-3"
        >
          {copy.cta}
        </button>
      )}
    </div>
  );
}
