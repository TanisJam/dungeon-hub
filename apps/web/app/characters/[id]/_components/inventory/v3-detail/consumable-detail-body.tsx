'use client';

/**
 * ConsumableDetailBody — client component.
 *
 * Owns optimistic decrement state (DB4).
 * CTA: "Usar (acción)" stub — decrements local counter, does NOT persist.
 *
 * Reqs: WICD-BODY-01 (spec #1070)
 * Design: DBE3 — 'use client' body because it owns useState for optimistic decrement.
 *
 * PHB p.153 — Adventuring Gear (potions, action to drink).
 * DMG p.139-140 — Charges.
 */
import { useState } from 'react';
import type { ConsumableDetailVariant } from '@/lib/sheet-types';

interface ConsumableDetailBodyProps {
  detail: ConsumableDetailVariant;
}

export function ConsumableDetailBody({ detail }: ConsumableDetailBodyProps) {
  // DB4: Optimistic local state. Refresh re-syncs to DB value.
  const [qty, setQty] = useState(detail.qty);

  function handleUse() {
    if (qty > 0) {
      setQty((prev) => prev - 1);
    }
  }

  return (
    <div>
      {/* Counter block */}
      <div className="inventory-init-detail-counter">
        <span className="v">{qty}</span>
        <span className="lbl">restantes</span>
        <span className="meta">×{detail.qty}</span>
      </div>

      {/* Effect summary */}
      {detail.entriesSummary && (
        <div className="inventory-init-detail-facts full" style={{ marginTop: '10px' }}>
          <div className="fact">
            <div className="k">Efecto</div>
            <div className="v small">{detail.entriesSummary}</div>
          </div>
        </div>
      )}

      {/* Use CTA — stub, DB4 */}
      <button
        type="button"
        onClick={handleUse}
        className="inventory-init-detail-use-big secondary"
        data-stub="true"
        aria-label="Próximamente — no persiste aún"
        style={{ marginTop: '10px' }}
      >
        Usar ({detail.actionCost})
      </button>
    </div>
  );
}
