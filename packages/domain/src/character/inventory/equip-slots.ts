import { classifyItem } from './proficiency.js';
import type {
  InventoryItem,
  InventoryValidationIssue,
  ItemCompendiumLite,
} from './types.js';

/**
 * Reglas PHB cap. 5:
 *  - 1 body armor equipada (LA/MA/HA).
 *  - 1 shield equipado (S).
 *  - 2 manos para weapons. Two-handed (2H) ocupa las 2. Light (L) puede dual-wield.
 *  - Shield + 2H weapon = imposible (suma 3+ "manos").
 *
 * Esta función valida UN intento de equipar (transición → 'equipped' o cambio
 * de equipHand) contra el inventario actual. Devuelve la lista de issues que
 * impedirían la operación.
 *
 * El caller construye el inventario "candidato" (con el ítem nuevo/modificado
 * en su estado deseado) y pasa eso acá.
 */
export function checkEquipSlots(
  candidateInventory: InventoryItem[],
  itemDataByKey: ReadonlyMap<string, ItemCompendiumLite>,
): InventoryValidationIssue[] {
  const issues: InventoryValidationIssue[] = [];

  const equipped = candidateInventory.filter((it) => it.state === 'equipped');

  // ---- Body armor: solo 1 a la vez ----
  const bodyArmors = equipped.filter((it) => {
    const data = itemDataByKey.get(`${it.itemSlug}|${it.itemSource}`);
    if (!data) return false;
    const kind = classifyItem(data);
    return kind === 'armor-light' || kind === 'armor-medium' || kind === 'armor-heavy';
  });
  if (bodyArmors.length > 1) {
    issues.push({ code: 'BODY_ARMOR_SLOT_FULL', currentInstanceId: bodyArmors[0]!.instanceId });
  }

  // ---- Shield: solo 1 a la vez ----
  const shields = equipped.filter((it) => {
    const data = itemDataByKey.get(`${it.itemSlug}|${it.itemSource}`);
    if (!data) return false;
    return classifyItem(data) === 'shield';
  });
  if (shields.length > 1) {
    issues.push({ code: 'SHIELD_SLOT_FULL', currentInstanceId: shields[0]!.instanceId });
  }

  // ---- Manos: weapons + 1 hand por shield ----
  let handsUsed = shields.length > 0 ? 1 : 0;

  const weapons = equipped.filter((it) => {
    const data = itemDataByKey.get(`${it.itemSlug}|${it.itemSource}`);
    if (!data) return false;
    return classifyItem(data) === 'weapon';
  });

  let hasOffHand = false;
  for (const w of weapons) {
    const data = itemDataByKey.get(`${w.itemSlug}|${w.itemSource}`)!;
    const props = (data.property ?? []).map((p) => p.toUpperCase());
    const isTwoHanded = props.includes('2H');
    const isLight = props.includes('L');
    const hand = w.equipHand ?? 'main';

    if (isTwoHanded && hand !== 'both') {
      issues.push({
        code: 'TWO_HANDED_REQUIRES_BOTH',
        itemSlug: w.itemSlug,
        itemSource: w.itemSource,
      });
      continue;
    }

    if (hand === 'off' && !isLight) {
      issues.push({
        code: 'OFF_HAND_REQUIRES_LIGHT',
        itemSlug: w.itemSlug,
        itemSource: w.itemSource,
      });
      continue;
    }

    if (hand === 'both' || isTwoHanded) {
      handsUsed += 2;
    } else if (hand === 'off') {
      if (hasOffHand) {
        // Más de un arma como off-hand — solo se permite 1 main + 1 off.
        issues.push({
          code: 'HANDS_EXCEEDED',
          handsUsed: handsUsed + 1,
          handsMax: 2,
          detail: 'Más de un arma en off-hand',
        });
      }
      hasOffHand = true;
      handsUsed += 1;
    } else {
      handsUsed += 1;
    }
  }

  if (handsUsed > 2 && !issues.some((i) => i.code === 'HANDS_EXCEEDED')) {
    issues.push({
      code: 'HANDS_EXCEEDED',
      handsUsed,
      handsMax: 2,
      detail: `Total de manos ocupadas: ${handsUsed} (shield + weapons)`,
    });
  }

  return issues;
}
