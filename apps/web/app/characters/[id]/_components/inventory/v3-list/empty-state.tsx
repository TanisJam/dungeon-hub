/**
 * EmptyState — per-filter empty card for the v3 inventory list.
 *
 * Server Component (pure render).
 * Reqs: WIVLS-EMPTY-01 (spec #1063), WID4-CHIPS-01 (spec #1077)
 * Design: DA9 (Slice A — Libros/Quest deferred); DCE4 (Slice C — book/quest enabled).
 */
import type { V3ItemType } from '@/lib/sheet-types';

type FilterKey = V3ItemType | 'all';

interface EmptyStateProps {
  filter: FilterKey;
}

const EMPTY_COPY: Record<string, { title: string; cta: string | null }> = {
  weapon:     { title: 'Sin armas en el inventario', cta: 'Agregar arma' },
  armor:      { title: 'Sin armadura en el inventario', cta: 'Agregar armadura' },
  magic:      { title: 'Sin ítems mágicos', cta: 'Agregar ítem' },
  consumable: { title: 'Sin consumibles', cta: 'Agregar consumible' },
  food:       { title: 'Sin comida ni provisiones', cta: 'Agregar ítem' },
  trinket:    { title: 'Sin baratijas ni miscelláneos', cta: 'Agregar ítem' },
  // DCE4 (Slice C): book + quest are now enabled — real copy replaces "Próximamente"
  book:       { title: 'Sin libros en el inventario', cta: 'Agregar libro' },
  quest:      { title: 'Sin objetos de quest activos', cta: null },
  all:        { title: 'Tu inventario está vacío', cta: 'Agregar ítem' },
};

export function EmptyState({ filter }: EmptyStateProps) {
  const copy = EMPTY_COPY[filter] ?? EMPTY_COPY['all']!;

  return (
    <div className="inventory-init-empty">
      <p className="ttl">{copy.title}</p>
      {copy.cta && (
        <p className="cta" role="button" tabIndex={0}>
          {copy.cta}
        </p>
      )}
    </div>
  );
}
