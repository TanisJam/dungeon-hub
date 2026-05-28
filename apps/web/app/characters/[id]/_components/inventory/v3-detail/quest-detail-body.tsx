/**
 * QuestDetailBody — server component (RSC).
 *
 * Renders quest item: queststamp card with ⚿ glyph + questName + stage + visibleTo
 * + two disabled CTA stubs (Ver quest / Mostrar al DM).
 *
 * All CTAs are disabled stubs (DC6 — RSC event-handler rule; no onClick).
 * Quest items ONLY appear when v3TypeOverride === 'quest' (DC4 — 100% override-gated).
 *
 * Reqs: WIQD-BODY-01 (spec #1077)
 * Design: DCE1 (RSC), DC4 (only via v3TypeOverride), DC6 (stub CTAs)
 *
 * House rule §1.2: no PHB cite — quest items are a house rule.
 * ERC5: queststamp .qn has ellipsis overflow (handled in globals.css).
 * ERC4: ⚿ glyph via var(--font-display), serif fallback chain.
 */
import type { QuestDetailVariant } from '@/lib/sheet-types';

interface QuestDetailBodyProps {
  detail: QuestDetailVariant;
}

export function QuestDetailBody({ detail }: QuestDetailBodyProps) {
  return (
    <div>
      {/* Queststamp card — ⚿ glyph in 44px circle (ERC4: font-display fallback) */}
      <div className="inventory-init-detail-queststamp" style={{ marginTop: '10px' }}>
        <div className="symbol" aria-hidden="true">⚿</div>
        <div className="body">
          <span className="ttl">Objeto de quest activa</span>
          <span className="qn">{detail.questName}</span>
          <span className="stg">
            {detail.stage} · visible a {detail.visibleTo}
          </span>
        </div>
      </div>

      {/* DC6: Disabled CTA stubs — no onClick (RSC event-handler rule) */}
      <div className="inventory-init-detail-actions" style={{ marginTop: '14px' }}>
        <button
          disabled
          className="inventory-init-detail-use-big"
          data-stub="true"
          aria-label="Ver quest"
        >
          Ver quest
        </button>
        <button
          disabled
          className="btn-ghost"
          data-stub="true"
          aria-label="Mostrar al DM"
        >
          Mostrar al DM
        </button>
      </div>
    </div>
  );
}
