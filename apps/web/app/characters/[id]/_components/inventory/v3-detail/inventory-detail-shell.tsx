/**
 * InventoryDetailShell — server component (inner RSC body for V3Sheet).
 *
 * Composes: hero + type-specific renderer body + sections + footer.
 * Handles loading and error states.
 *
 * Reqs: WIDS-SHELL-01 (spec #1070)
 * Design: DBE3 — weapon/armor bodies are RSC; consumable/food are client.
 */
import type { InventoryDetailResponse } from '@/lib/sheet-types';
import { InventoryDetailHero } from './inventory-detail-hero';
import { InventoryDetailSection } from './inventory-detail-section';
import { InventoryDetailFooter } from './inventory-detail-footer';
import { WeaponDetailBody } from './weapon-detail-body';
import { ArmorDetailBody } from './armor-detail-body';
import { ConsumableDetailBody } from './consumable-detail-body';
import { FoodDetailBody } from './food-detail-body';

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
      {detail.v3Type === 'incomplete' && (
        <InventoryDetailSection title="Detalles incompletos">
          <p style={{ fontSize: '12px', color: 'var(--color-ink-soft)' }}>
            No tenemos datos mecánicos de este ítem.
          </p>
        </InventoryDetailSection>
      )}

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
