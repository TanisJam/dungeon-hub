/**
 * InventoryDetailShell — server component (inner RSC body for V3Sheet).
 *
 * Composes: hero + type-specific renderer body + sections + footer.
 * Handles loading and error states.
 *
 * Reqs: WIDS-SHELL-01 (spec #1070), WIMD-BODY-01 WIBD-BODY-01 WITD-BODY-01 WIQD-BODY-01 (spec #1077)
 * Design: DBE3 (Slice B), DCE1 + DCE2 (Slice C — all 4 advanced bodies are RSC; no 'incomplete' fallback)
 */
import type { InventoryDetailResponse } from '@/lib/sheet-types';
import { InventoryDetailHero } from './inventory-detail-hero';
import { InventoryDetailFooter } from './inventory-detail-footer';
import { WeaponDetailBody } from './weapon-detail-body';
import { ArmorDetailBody } from './armor-detail-body';
import { ConsumableDetailBody } from './consumable-detail-body';
import { FoodDetailBody } from './food-detail-body';
import { MagicDetailBody } from './magic-detail-body';
import { BookDetailBody } from './book-detail-body';
import { TrinketDetailBody } from './trinket-detail-body';
import { QuestDetailBody } from './quest-detail-body';

interface InventoryDetailShellProps {
  detail: InventoryDetailResponse | null;
  characterId: string;
  loading: boolean;
  error: string | null;
}

export function InventoryDetailShell({
  detail,
  characterId,
  loading,
  error,
}: InventoryDetailShellProps) {
  if (loading) {
    return (
      <div className="inventory-init-detail-shell">
        <div className="inventory-init-detail-loading">Cargando…</div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="inventory-init-detail-shell">
        <div className="inventory-init-detail-error">
          {error ?? 'No se pudo cargar el ítem.'}
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-init-detail-shell">
      <InventoryDetailHero detail={detail} characterId={characterId} />

      {detail.v3Type === 'weapon' && <WeaponDetailBody detail={detail} />}
      {detail.v3Type === 'armor' && <ArmorDetailBody detail={detail} />}
      {detail.v3Type === 'consumable' && <ConsumableDetailBody detail={detail} />}
      {detail.v3Type === 'food' && <FoodDetailBody detail={detail} />}
      {/* Slice C: 4 new RSC bodies (DCE1). No 'incomplete' fallback (DCE2). */}
      {detail.v3Type === 'magic' && <MagicDetailBody detail={detail} />}
      {detail.v3Type === 'book' && <BookDetailBody detail={detail} />}
      {detail.v3Type === 'trinket' && <TrinketDetailBody detail={detail} />}
      {detail.v3Type === 'quest' && <QuestDetailBody detail={detail} />}

      {detail.notes && (
        <div className="inventory-init-detail-notes">{detail.notes}</div>
      )}

      <InventoryDetailFooter
        characterId={characterId}
        instanceId={detail.instanceId}
        itemName={detail.displayName}
      />
    </div>
  );
}
