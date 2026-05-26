/**
 * Inventario tab — Server Component shell composing interactive client islands.
 *
 * SDD inventory-foundation (#842) — this rewrite turns the previously read-only
 * inventory display into an interactive surface:
 *   - Picker          (add)
 *   - EquipToggle     (equip/unequip per row)
 *   - DeleteButton    (remove per row)
 *   - EncumbranceBar  (PHB p.176 thresholds + warning banner)
 *   - STR-min banner  (REQ-AC-STR-WARNING from sheet.warnings)
 *
 * REQ-INV-MOBILE-LAYOUT — designed for 375px viewport first.
 */
import type {
  CharacterSheet,
  Currency,
  InventoryItem,
  SheetWarningCode,
} from '@/lib/sheet-types';
import { Card } from '@/components/ui';
import { Picker } from '../_components/inventory/picker';
import { EquipToggle } from '../_components/inventory/equip-toggle';
import { DeleteButton } from '../_components/inventory/delete-button';
import { EncumbranceBar } from '../_components/inventory/encumbrance-bar';

interface InventarioTabProps {
  characterId: string;
  worldId: string;
  inventory: InventoryItem[];
  sheet: CharacterSheet;
}

type Bucket = 'equipped' | 'carried' | 'stowed';

const BUCKETS: ReadonlyArray<{ key: Bucket; label: string }> = [
  { key: 'equipped', label: 'Equipados' },
  { key: 'carried', label: 'Portados' },
  { key: 'stowed', label: 'Guardados' },
];

/**
 * Currency block — REQ-ID-CURRENCY-BLOCK (sdd/inventory-d4-d6 spec #889).
 * 5-column compact grid for 375px. Each cell: count + denomination label.
 * Tap targets ≥44px (min-h-[44px]).
 */
function CurrencyBlock({ currency }: { currency: Currency }) {
  const COINS: Array<{ key: keyof Currency; label: string; color: string }> = [
    { key: 'cp', label: 'MC', color: 'text-amber-700' },
    { key: 'sp', label: 'MP', color: 'text-slate-500' },
    { key: 'ep', label: 'ME', color: 'text-teal-600' },
    { key: 'gp', label: 'MO', color: 'text-yellow-600' },
    { key: 'pp', label: 'PP', color: 'text-violet-600' },
  ];

  return (
    <div className="grid grid-cols-5 gap-1" aria-label="Monedas">
      {COINS.map(({ key, label, color }) => (
        <div
          key={key}
          className="flex min-h-[44px] flex-col items-center justify-center rounded-md bg-paper-soft px-1 py-2"
        >
          <p className={`text-sm font-bold tabular-nums ${color}`}>
            {currency[key] ?? 0}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mute">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

export function InventarioTab({
  characterId,
  worldId,
  inventory,
  sheet,
}: InventarioTabProps) {
  const warnings: SheetWarningCode[] = sheet.warnings ?? [];
  const hasStrWarning = warnings.includes('INSUFFICIENT_STRENGTH_FOR_ARMOR');

  const grouped: Record<Bucket, InventoryItem[]> = {
    equipped: [],
    carried: [],
    stowed: [],
  };
  for (const item of inventory) {
    grouped[item.state].push(item);
  }

  return (
    <div className="space-y-4">
      <Picker characterId={characterId} worldId={worldId} />

      {/* REQ-ID-CURRENCY-BLOCK: currency block always rendered (0 = no coins). */}
      <Card variant="surface" className="p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
          Monedas
        </p>
        <CurrencyBlock currency={sheet.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }} />
      </Card>

      {sheet.encumbrance && (
        <Card variant="surface" className="p-4">
          <EncumbranceBar encumbrance={sheet.encumbrance} />
        </Card>
      )}

      {hasStrWarning && (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
        >
          Fuerza insuficiente para esta armadura: aplicá penalty de velocidad
          según PHB p.144.
        </div>
      )}

      {inventory.length === 0 ? (
        <Card variant="surface" className="px-4 py-10 text-center">
          <p className="text-sm text-ink-mute">Sin equipo.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {BUCKETS.map(({ key, label }) => {
            const rows = grouped[key];
            if (rows.length === 0) return null;
            return (
              <Card key={key} variant="surface" className="p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
                  {label} · {rows.length}
                </p>
                <ul className="space-y-2">
                  {rows.map((item) => (
                    <li
                      key={item.instanceId}
                      className="flex items-center gap-2 rounded-md bg-paper-soft px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {item.customName ?? item.itemSlug}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-ink-mute">
                          ×{item.quantity}
                          {item.attuned && (
                            <span className="ml-2 normal-case text-violet-700">
                              Sintonizado
                            </span>
                          )}
                        </p>
                      </div>
                      <EquipToggle
                        characterId={characterId}
                        instanceId={item.instanceId}
                        currentState={item.state}
                      />
                      <DeleteButton
                        characterId={characterId}
                        instanceId={item.instanceId}
                        itemName={item.customName ?? item.itemSlug}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
