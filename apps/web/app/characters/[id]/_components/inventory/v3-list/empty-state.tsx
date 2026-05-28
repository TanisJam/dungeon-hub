/**
 * EmptyState — per-filter empty card for the v3 inventory list.
 *
 * Server Component (pure render).
 * Reqs: WIVLS-EMPTY-01 (spec #1063)
 * Design DA9: Libros + Quest show "Próximamente" instead of "Sin items" (D4 deferral).
 */
import type { V3ItemType } from '@/lib/sheet-types';

type FilterKey = V3ItemType | 'all';

interface EmptyStateProps {
  filter: FilterKey;
}

const DEFERRED: ReadonlySet<FilterKey> = new Set<FilterKey>(['book', 'quest']);

const EMPTY_COPY: Record<string, { title: string; cta: string | null }> = {
  weapon:     { title: 'Sin armas en el inventario', cta: 'Agregar arma' },
  armor:      { title: 'Sin armadura en el inventario', cta: 'Agregar armadura' },
  magic:      { title: 'Sin ítems mágicos', cta: 'Agregar ítem' },
  consumable: { title: 'Sin consumibles', cta: 'Agregar consumible' },
  food:       { title: 'Sin comida ni provisiones', cta: 'Agregar ítem' },
  trinket:    { title: 'Sin baratijas ni miscelláneos', cta: 'Agregar ítem' },
  book:       { title: 'Próximamente', cta: null },
  quest:      { title: 'Próximamente', cta: null },
  all:        { title: 'Tu inventario está vacío', cta: 'Agregar ítem' },
};

export function EmptyState({ filter }: EmptyStateProps) {
  const isDeferred = DEFERRED.has(filter);
  const copy = EMPTY_COPY[filter] ?? EMPTY_COPY['all']!;

  return (
    <div className="inventory-init-empty">
      <p className="ttl">{copy.title}</p>
      {isDeferred ? (
        <p className="sub" style={{ fontSize: '11px', color: 'var(--color-ink-mute)' }}>
          Disponible en una futura actualización
        </p>
      ) : (
        copy.cta && (
          <p className="cta" role="button" tabIndex={0}>
            {copy.cta}
          </p>
        )
      )}
    </div>
  );
}
