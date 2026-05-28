'use client';

/**
 * FoodDetailBody — client component.
 *
 * Owns optimistic decrement state for servings (DB4).
 * CTA: "Comer una porción" stub — decrements local servings, does NOT persist.
 *
 * Reqs: WIFD-BODY-01 (spec #1070)
 * Design: DBE3 — 'use client' because it owns useState for optimistic decrement.
 *
 * PHB p.185 — Food & Water (1 lb per ration per day).
 * PHB p.153 — Rations.
 */
import { useState } from 'react';
import type { FoodDetailVariant } from '@/lib/sheet-types';

interface FoodDetailBodyProps {
  detail: FoodDetailVariant;
}

export function FoodDetailBody({ detail }: FoodDetailBodyProps) {
  // DB4: Optimistic local state. Refresh re-syncs to DB value.
  const [servings, setServings] = useState(detail.servings);

  function handleEat() {
    if (servings > 0) {
      setServings((prev) => prev - 1);
    }
  }

  return (
    <div>
      {/* PHB p.185: Porciones / Cantidad / Tipo */}
      <div className="inventory-init-detail-facts three" style={{ marginTop: '10px' }}>
        <div className="fact">
          <div className="k">Porciones</div>
          <div className="v mono">{servings}</div>
        </div>
        <div className="fact">
          <div className="k">Cantidad</div>
          <div className="v small">×{detail.qty}</div>
        </div>
        <div className="fact">
          <div className="k">Tipo</div>
          <div className="v small">{detail.foodKind}</div>
        </div>
      </div>

      {/* Consume note */}
      {detail.consumeNote && (
        <div className="inventory-init-detail-facts full" style={{ marginTop: '8px' }}>
          <div className="fact">
            <div className="k">Cómo se usa</div>
            <div className="v small">{detail.consumeNote}</div>
          </div>
        </div>
      )}

      {/* Eat CTA — stub, DB4 */}
      <button
        type="button"
        onClick={handleEat}
        className="inventory-init-detail-use-big"
        data-stub="true"
        aria-label="Próximamente — no persiste aún"
        style={{ marginTop: '10px' }}
      >
        Comer una porción
      </button>
    </div>
  );
}
