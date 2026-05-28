/**
 * Inventario tab — Slice B composition.
 *
 * Composes Picker + InventoryV3List (which wraps InventoryDetailIsland).
 * V3SheetStub and sr-only ER10 legacy list have been retired (Slice B ER10 migration).
 *
 * Replaces the bucket-grouped layout (Equipados / Portados / Guardados) with
 * the v3 list view (currency strip · weight bar · equipped grid · type chips · grouped rows).
 * Row tap opens the detail sheet via InventoryDetailIsland event delegation.
 *
 * Reqs: WIVLS-CURRENCY-01 through WIVLS-EMPTY-01, WIVS-SCOPE-01, WIE10-MIGRATE-01..03
 */
import type {
  CharacterSheet,
  Currency,
  EnrichedInventoryItem,
  SheetWarningCode,
} from '@/lib/sheet-types';
import { Picker } from '../_components/inventory/picker';
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
    </div>
  );
}
