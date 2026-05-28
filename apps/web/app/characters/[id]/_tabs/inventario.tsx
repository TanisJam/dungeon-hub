/**
 * Inventario tab — Slice A composition.
 *
 * Composes Picker + InventoryV3List. Legacy EquipToggle + DeleteButton are
 * preserved inline per row (ER10 — visible until Slice B ships V3Sheet renderers).
 *
 * Replaces the bucket-grouped layout (Equipados / Portados / Guardados) with
 * the v3 list view (currency strip · weight bar · equipped grid · type chips · grouped rows).
 *
 * Reqs: WIVLS-CURRENCY-01 through WIVLS-EMPTY-01, WIVS-SCOPE-01
 * TODO (Slice B): delete encumbrance-bar.tsx — only consumer was this file.
 */
import type {
  CharacterSheet,
  Currency,
  EnrichedInventoryItem,
  SheetWarningCode,
} from '@/lib/sheet-types';
import { Picker } from '../_components/inventory/picker';
import { EquipToggle } from '../_components/inventory/equip-toggle';
import { DeleteButton } from '../_components/inventory/delete-button';
import { InventoryV3List } from '../_components/inventory/v3-list/inventory-v3-list';

interface InventarioTabProps {
  characterId: string;
  worldId: string;
  inventory: EnrichedInventoryItem[];
  sheet: CharacterSheet;
}

export function InventarioTab({
  characterId,
  worldId,
  inventory,
  sheet,
}: InventarioTabProps) {
  const warnings: SheetWarningCode[] = sheet.warnings ?? [];
  const hasStrWarning = warnings.includes('INSUFFICIENT_STRENGTH_FOR_ARMOR');

  const currency: Currency = sheet.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const encumbrance = sheet.encumbrance;

  return (
    <div className="space-y-4">
      <Picker characterId={characterId} worldId={worldId} />

      {hasStrWarning && (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
        >
          Fuerza insuficiente para esta armadura: aplicá penalty de velocidad
          según PHB p.144.
        </div>
      )}

      {encumbrance && (
        <InventoryV3List
          characterId={characterId}
          inventory={inventory}
          currency={currency}
          encumbrance={encumbrance}
          warnings={warnings}
        />
      )}

      {/* ER10 — legacy affordances: EquipToggle + DeleteButton accessible for round-trip tests.
          Preserved until Slice B ships V3Sheet renderers that absorb these actions.
          TODO (Slice B): remove this block and wire through V3SheetStub. */}
      {inventory.length > 0 && (
        <ul aria-label="Acciones de inventario (legado)" className="sr-only" aria-hidden={false}>
          {inventory.map((item) => (
            <li key={item.instanceId}>
              <EquipToggle
                characterId={characterId}
                instanceId={item.instanceId}
                currentState={item.equipped ? 'equipped' : 'carried'}
              />
              <DeleteButton
                characterId={characterId}
                instanceId={item.instanceId}
                itemName={item.displayName ?? item.itemSlug}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
