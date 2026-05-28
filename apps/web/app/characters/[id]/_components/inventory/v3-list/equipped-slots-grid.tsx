/**
 * EquippedSlotsGrid — 4-card grid showing equipped items by slot.
 *
 * Server Component (pure render — no client state).
 * Reqs: WIVLS-EQUIPPED-01 (spec #1063)
 *
 * Slots:
 * - Princ.: first equipped weapon with equipHand === 'main' | 'both'
 * - Sec.: first equipped weapon with equipHand === 'off'
 * - Cuerpo: first equipped item with v3Type === 'armor'
 * - Acces.: ALWAYS dashed "vacío" in Slice A (D1 — accessory slot unmodeled)
 *           aria-disabled="true" + aria-label="Acces. (próximamente)" (DA10)
 */
import type { EnrichedInventoryItem } from '@/lib/sheet-types';

interface EquippedSlotsGridProps {
  items: EnrichedInventoryItem[];
}

interface Slot {
  role: string;
  item: EnrichedInventoryItem | null;
  /** D1: always forced empty, never resolved from inventory */
  alwaysEmpty?: boolean;
}

function deriveSlots(items: EnrichedInventoryItem[]): Slot[] {
  const equipped = items.filter((it) => it.equipped);

  const mainHand = equipped.find(
    (it) => it.v3Type === 'weapon' && (it.equipHand === 'main' || it.equipHand === 'both'),
  ) ?? null;

  const offHand = equipped.find(
    (it) => it.v3Type === 'weapon' && it.equipHand === 'off',
  ) ?? null;

  const body = equipped.find((it) => it.v3Type === 'armor') ?? null;

  return [
    { role: 'Princ.', item: mainHand },
    { role: 'Sec.', item: offHand },
    { role: 'Cuerpo', item: body },
    { role: 'Acces.', item: null, alwaysEmpty: true }, // D1 — always dashed
  ];
}

export function EquippedSlotsGrid({ items }: EquippedSlotsGridProps) {
  const slots = deriveSlots(items);

  return (
    <div className="inventory-init-equipped">
      {slots.map(({ role, item, alwaysEmpty }) => {
        const isEmpty = alwaysEmpty || item == null;
        const isAcces = alwaysEmpty === true;

        return (
          <button
            key={role}
            type="button"
            className={`slot ${isEmpty ? 'empty' : 'filled'}`}
            aria-label={isAcces ? 'Acces. (próximamente)' : `${role}${item ? `: ${item.displayName}` : ''}`}
            aria-disabled={isAcces ? 'true' : undefined}
            disabled={isAcces}
          >
            <span className="role">{role}</span>
            {isEmpty ? (
              <span className="ic" aria-hidden="true">+</span>
            ) : (
              <>
                <span className="ic" aria-hidden="true">⚔</span>
                <span className="nm">{item!.displayName}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
