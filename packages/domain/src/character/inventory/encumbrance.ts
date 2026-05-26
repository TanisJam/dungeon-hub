import type { InventoryItem, ItemCompendiumLite } from './types.js';

/** PHB p.176 — default no-variant: solo importa el máximo (STR × 15). */
export function carryingCapacity(strScore: number): number {
  return Math.max(0, strScore) * 15;
}

/**
 * Suma `weight × quantity` para todos los ítems del inventario, respetando
 * containers "weightless" (Bag of Holding, Heward's, etc.): si CUALQUIER
 * ancestro en la cadena de containerId es weightless, el ítem aporta 0 al
 * encumbrance del wearer. El peso PROPIO del container sí cuenta (mientras
 * él mismo no esté dentro de otro weightless).
 *
 * Ítems sin weight en el compendio cuentan como 0 (magic items intangibles).
 *
 * `liteLookup` mapea `${slug}|${source}` → ItemCompendiumLite. El caller
 * arma el lookup leyendo el compendio una sola vez por op.
 */
export function totalWeight(
  inventory: InventoryItem[],
  liteLookup: ReadonlyMap<string, ItemCompendiumLite>,
): number {
  const byInstanceId = new Map<string, InventoryItem>();
  for (const it of inventory) byInstanceId.set(it.instanceId, it);

  let total = 0;
  for (const it of inventory) {
    const lite = liteLookup.get(`${it.itemSlug}|${it.itemSource}`);
    const w = lite?.weight;
    if (w == null) continue;
    if (isInsideWeightless(it, byInstanceId, liteLookup)) continue;
    total += w * it.quantity;
  }
  return total;
}

/**
 * True si el item tiene algún ancestro (en su cadena de containerId) cuyo
 * compendio sea `containerCapacity.weightless === true`. Cycle-safe.
 */
function isInsideWeightless(
  item: InventoryItem,
  byInstanceId: ReadonlyMap<string, InventoryItem>,
  liteLookup: ReadonlyMap<string, ItemCompendiumLite>,
): boolean {
  let cursor = item.containerId ?? null;
  const seen = new Set<string>();
  while (cursor != null) {
    if (seen.has(cursor)) return false; // cycle guard
    seen.add(cursor);
    const parent = byInstanceId.get(cursor);
    if (!parent) return false;
    const parentLite = liteLookup.get(`${parent.itemSlug}|${parent.itemSource}`);
    if (parentLite?.containerCapacity?.weightless === true) return true;
    cursor = parent.containerId ?? null;
  }
  return false;
}

/** Peso del contenido directo (excluyendo el container mismo y sus ancestros). */
export function containerContentsWeight(
  containerInstanceId: string,
  inventory: InventoryItem[],
  liteLookup: ReadonlyMap<string, ItemCompendiumLite>,
): number {
  const byInstanceId = new Map<string, InventoryItem>();
  for (const it of inventory) byInstanceId.set(it.instanceId, it);

  let total = 0;
  for (const it of inventory) {
    if (!isDescendantOf(it, containerInstanceId, byInstanceId)) continue;
    const lite = liteLookup.get(`${it.itemSlug}|${it.itemSource}`);
    const w = lite?.weight;
    if (w == null) continue;
    total += w * it.quantity;
  }
  return total;
}

function isDescendantOf(
  item: InventoryItem,
  ancestorId: string,
  byInstanceId: ReadonlyMap<string, InventoryItem>,
): boolean {
  let cursor = item.containerId ?? null;
  const seen = new Set<string>();
  while (cursor != null) {
    if (cursor === ancestorId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const parent = byInstanceId.get(cursor);
    if (!parent) return false;
    cursor = parent.containerId ?? null;
  }
  return false;
}

export function buildWeightLookup(
  items: ReadonlyArray<ItemCompendiumLite>,
): Map<string, ItemCompendiumLite> {
  const map = new Map<string, ItemCompendiumLite>();
  for (const it of items) map.set(`${it.slug}|${it.source}`, it);
  return map;
}

export type EncumbranceStatus = 'ok' | 'encumbered' | 'heavily-encumbered' | 'over';

export interface EncumbranceView {
  weight: number;
  /** Umbral máximo absoluto (STR×15). Por encima se considera 'over'. */
  max: number;
  status: EncumbranceStatus;
  /** Si la regla variant está ON, exponemos los umbrales intermedios. */
  thresholds: {
    encumbered: number; // STR × 5  (solo si variant)
    heavily: number;    // STR × 10 (solo si variant)
    max: number;        // STR × 15
  };
  /** Penalty de velocidad por encumbrance variant. 0 si ok o si variant OFF. */
  speedPenalty: number;
  /**
   * Peso aportado por las monedas del personaje (PHB p.143: 50 monedas = 1 lb).
   * Siempre >= 0. Se incluye en `weight`. Exponemos por separado para que
   * la UI pueda mostrar el sub-hint "Monedas: X lb".
   */
  coinWeight: number;
}

/**
 * Evalúa encumbrance contra peso total.
 *
 * - Sin variant (default): solo importa el máximo STR×15. Status: 'ok' o 'over'.
 * - Con variant (PHB p.176):
 *   - peso > STR×15 → 'over' (no podés cargar más)
 *   - peso > STR×10 → 'heavily-encumbered', speed -20, disadvantage en STR/DEX/CON
 *     ability checks, attack rolls y saves.
 *   - peso > STR×5  → 'encumbered', speed -10.
 *   - else → 'ok'.
 */
/**
 * Evalúa encumbrance contra peso total.
 *
 * - Sin variant (default): solo importa el máximo STR×15. Status: 'ok' o 'over'.
 * - Con variant (PHB p.176):
 *   - peso > STR×15 → 'over' (no podés cargar más)
 *   - peso > STR×10 → 'heavily-encumbered', speed -20, disadvantage en STR/DEX/CON
 *     ability checks, attack rolls y saves.
 *   - peso > STR×5  → 'encumbered', speed -10.
 *   - else → 'ok'.
 *
 * `coinWeightLb` es el peso de las monedas (ya incluido en `weight`). Se propaga
 * tal cual al resultado para que el caller (compute.ts) pueda exponerlo en la UI.
 * PHB p.143: 50 coins = 1 lb.
 */
export function evaluateEncumbrance(
  weight: number,
  strScore: number,
  variant = false,
  coinWeightLb = 0,
): EncumbranceView {
  const max = Math.max(0, strScore) * 15;
  const encumbered = Math.max(0, strScore) * 5;
  const heavily = Math.max(0, strScore) * 10;
  const thresholds = { encumbered, heavily, max };
  const coinWeight = coinWeightLb;

  if (weight > max) {
    return { weight, max, status: 'over', thresholds, speedPenalty: variant ? 20 : 0, coinWeight };
  }
  if (variant) {
    if (weight > heavily) {
      return { weight, max, status: 'heavily-encumbered', thresholds, speedPenalty: 20, coinWeight };
    }
    if (weight > encumbered) {
      return { weight, max, status: 'encumbered', thresholds, speedPenalty: 10, coinWeight };
    }
  }
  return { weight, max, status: 'ok', thresholds, speedPenalty: 0, coinWeight };
}
