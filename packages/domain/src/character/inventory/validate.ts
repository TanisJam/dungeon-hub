import {
  buildWeightLookup,
  carryingCapacity,
  containerContentsWeight,
  totalWeight,
} from './encumbrance.js';
import { checkEquipSlots } from './equip-slots.js';
import { checkEquippedProficiency } from './proficiency.js';
import {
  type AddItemInput,
  type ConsumedReport,
  type InventoryContext,
  type InventoryItem,
  type InventoryOpResult,
  type InventoryValidationIssue,
  type InventoryWarning,
  type ItemCompendiumLite,
  type ItemState,
  type UpdateItemInput,
} from './types.js';

/**
 * 5etools type codes que son consumibles via stack (decrementan quantity).
 * `P` = potion, `SC` = spell scroll, `A` = ammunition. El compendio puede
 * traer el code con sufijo de source ("SC|DMG"), así que normalizamos antes
 * de comparar.
 */
const QUANTITY_CONSUMABLE_TYPES = new Set(['P', 'SC', 'A']);

function normalizeTypeCode(type: string | null | undefined): string | null {
  if (type == null) return null;
  const head = type.split('|')[0];
  return head ?? null;
}

function isQuantityConsumable(itemData: ItemCompendiumLite): boolean {
  const code = normalizeTypeCode(itemData.type);
  return code != null && QUANTITY_CONSUMABLE_TYPES.has(code);
}

/** Solo munición (no potions/scrolls) hace auto-merge en addItemToInventory. */
function isAmmunition(itemData: ItemCompendiumLite): boolean {
  return normalizeTypeCode(itemData.type) === 'A';
}

function isContainer(itemData: ItemCompendiumLite | undefined | null): boolean {
  return itemData?.containerCapacity != null;
}

/**
 * Valida el move de un ítem a un nuevo container. Devuelve issue si:
 *   - target no existe (CONTAINER_NOT_FOUND)
 *   - target no es container (NOT_A_CONTAINER)
 *   - target es el mismo ítem o uno de sus descendientes (CONTAINER_CYCLE)
 *
 * `targetContainerId === null` siempre devuelve null (mover a root).
 */
function validateContainerMove(args: {
  inventory: InventoryItem[];
  instanceId: string;
  targetContainerId: string | null;
  weights: ReadonlyArray<ItemCompendiumLite>;
  /** Lite del nuevo container, si el caller ya lo tiene. */
  targetItemData?: ItemCompendiumLite | null;
}): InventoryValidationIssue | null {
  const { inventory, instanceId, targetContainerId, weights, targetItemData } = args;
  if (targetContainerId == null) return null;

  if (targetContainerId === instanceId) {
    return { code: 'CONTAINER_CYCLE', instanceId, attemptedContainerId: targetContainerId };
  }

  const target = inventory.find((it) => it.instanceId === targetContainerId);
  if (!target) {
    return { code: 'CONTAINER_NOT_FOUND', containerId: targetContainerId };
  }

  const liteLookup = buildWeightLookup(weights);
  const targetLite =
    targetItemData ?? liteLookup.get(`${target.itemSlug}|${target.itemSource}`) ?? null;
  if (!isContainer(targetLite)) {
    return {
      code: 'NOT_A_CONTAINER',
      containerId: targetContainerId,
      itemSlug: target.itemSlug,
      itemSource: target.itemSource,
    };
  }

  // Cycle: ¿el target es descendiente del ítem que estoy moviendo?
  // Si lo es, meter el ítem adentro lo metería dentro de uno de sus hijos.
  const byInstanceId = new Map<string, InventoryItem>();
  for (const it of inventory) byInstanceId.set(it.instanceId, it);
  let cursor: string | null | undefined = target.containerId ?? null;
  const seen = new Set<string>();
  while (cursor != null) {
    if (cursor === instanceId) {
      return { code: 'CONTAINER_CYCLE', instanceId, attemptedContainerId: targetContainerId };
    }
    if (seen.has(cursor)) break; // datos corruptos: ya hay ciclo prexistente, no agravamos
    seen.add(cursor);
    const node = byInstanceId.get(cursor);
    cursor = node?.containerId ?? null;
  }

  return null;
}

export const ATTUNEMENT_MAX = 3;

function countAttuned(inventory: InventoryItem[]): number {
  return inventory.reduce((acc, it) => acc + (it.attuned ? 1 : 0), 0);
}

function makeInstanceId(): string {
  // Node 22 trae crypto global con randomUUID.
  return globalThis.crypto.randomUUID();
}

/**
 * Agrega un ítem al inventario.
 *
 * - Hard rule: attune cap = 3.
 * - Warnings (no bloquean):
 *   - Equipado sin proficiencia.
 *   - Peso total post-add supera STR × 15.
 */
export function addItemToInventory(args: {
  inventory: InventoryItem[];
  itemData: ItemCompendiumLite;
  input: AddItemInput;
  /** Lookup de pesos del compendio para todos los slugs ya presentes + el nuevo. */
  weights: ReadonlyArray<ItemCompendiumLite>;
  ctx: InventoryContext;
}): InventoryOpResult {
  const { inventory, itemData, input, weights, ctx } = args;
  const issues: InventoryValidationIssue[] = [];

  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    issues.push({ code: 'QUANTITY_INVALID', quantity, min: 1 });
  }

  const attuned = input.attuned ?? false;
  if (attuned) {
    const current = countAttuned(inventory);
    if (current >= ATTUNEMENT_MAX) {
      issues.push({ code: 'ATTUNEMENT_CAP_EXCEEDED', max: ATTUNEMENT_MAX, current });
    }
  }

  // Charges init — solo aplica si el compendio define un máximo.
  const maxCharges = itemData.charges ?? null;
  let initialCharges: number | null = null;
  if (maxCharges != null) {
    if (input.charges !== undefined && input.charges !== null) {
      if (!Number.isInteger(input.charges) || input.charges < 0 || input.charges > maxCharges) {
        issues.push({ code: 'CHARGES_EXCEEDS_MAX', charges: input.charges, max: maxCharges });
      } else {
        initialCharges = input.charges;
      }
    } else {
      initialCharges = maxCharges;
    }
  }

  // Validar containerId si se pasó. Para un add nuevo no hay ciclos posibles
  // (el item aún no existe), pero el target tiene que existir y ser container.
  const targetContainerId = input.containerId ?? null;
  if (targetContainerId != null) {
    const containerIssue = validateContainerMove({
      inventory,
      instanceId: '__pending__', // valor sentinel: no matchea nada
      targetContainerId,
      weights,
    });
    if (containerIssue) issues.push(containerIssue);
  }

  if (issues.length > 0) return { ok: false, issues };

  const newState: ItemState = input.state ?? 'carried';

  // Auto-merge para munición — un solo stack por (slug, source, state, containerId).
  // Razón: arrows/bolts/needles se consumen unitariamente y tener N instances
  // separados con qty=1 es ruido. Misma slug + source + state + container → mismo stack.
  // Diferente state (carried vs stowed) o diferente container se mantiene separado a propósito.
  // TODO (combat): cuando exista el sistema de attack, considerar linkear
  // un stack de ammo a un weapon equipado.
  if (isAmmunition(itemData)) {
    const existingIdx = inventory.findIndex(
      (it) =>
        it.itemSlug === itemData.slug
        && it.itemSource === itemData.source
        && it.state === newState
        && (it.containerId ?? null) === targetContainerId,
    );
    if (existingIdx !== -1) {
      const existing = inventory[existingIdx]!;
      const merged: InventoryItem = {
        ...existing,
        quantity: existing.quantity + quantity,
      };
      const nextInventory = [...inventory];
      nextInventory[existingIdx] = merged;
      const warnings = collectWarnings(nextInventory, merged, itemData, weights, ctx);
      return {
        ok: true,
        inventory: nextInventory,
        warnings,
        addedInstanceId: existing.instanceId,
      };
    }
  }

  const newItem: InventoryItem = {
    instanceId: makeInstanceId(),
    itemSlug: itemData.slug,
    itemSource: itemData.source,
    quantity,
    state: newState,
    attuned,
    customName: input.customName ?? null,
    notes: input.notes ?? '',
    equipHand: input.equipHand ?? null,
    charges: initialCharges,
    containerId: targetContainerId,
  };

  const nextInventory = [...inventory, newItem];

  // Si arranca equipped, validar slots (hard rule).
  if (newItem.state === 'equipped') {
    const lookup = new Map<string, ItemCompendiumLite>();
    for (const w of weights) lookup.set(`${w.slug}|${w.source}`, w);
    lookup.set(`${itemData.slug}|${itemData.source}`, itemData);
    const slotIssues = checkEquipSlots(nextInventory, lookup);
    if (slotIssues.length > 0) return { ok: false, issues: slotIssues };
  }

  const warnings = collectWarnings(nextInventory, newItem, itemData, weights, ctx);

  return {
    ok: true,
    inventory: nextInventory,
    warnings,
    addedInstanceId: newItem.instanceId,
  };
}

/**
 * Patch parcial de una instancia. Sólo campos definidos en `patch` se aplican.
 *
 * - Hard rule: si attuned pasa false→true y ya hay 3 attuned → ATTUNEMENT_CAP_EXCEEDED.
 * - Hard rule: quantity < 1 → QUANTITY_INVALID.
 * - Warnings: encumbrance y proficiency (cuando state pasa a 'equipped').
 */
export function updateInventoryItem(args: {
  inventory: InventoryItem[];
  instanceId: string;
  patch: UpdateItemInput;
  /** Lite del ítem patcheado — necesario para clasificar prof si state pasa a equipped. */
  itemData: ItemCompendiumLite;
  /** Lookup de pesos del compendio para todo el inventario. */
  weights: ReadonlyArray<ItemCompendiumLite>;
  ctx: InventoryContext;
}): InventoryOpResult {
  const { inventory, instanceId, patch, itemData, weights, ctx } = args;
  const issues: InventoryValidationIssue[] = [];

  const idx = inventory.findIndex((it) => it.instanceId === instanceId);
  if (idx === -1) {
    return { ok: false, issues: [{ code: 'INSTANCE_NOT_FOUND', instanceId }] };
  }
  const current = inventory[idx]!;

  if (patch.quantity !== undefined) {
    if (!Number.isInteger(patch.quantity) || patch.quantity < 1) {
      issues.push({ code: 'QUANTITY_INVALID', quantity: patch.quantity, min: 1 });
    }
  }

  if (patch.charges !== undefined && patch.charges !== null) {
    const maxCharges = itemData.charges ?? null;
    if (maxCharges == null) {
      // El item no soporta charges → tratamos como out-of-range con max=0.
      issues.push({ code: 'CHARGES_EXCEEDS_MAX', charges: patch.charges, max: 0 });
    } else if (!Number.isInteger(patch.charges) || patch.charges < 0 || patch.charges > maxCharges) {
      issues.push({ code: 'CHARGES_EXCEEDS_MAX', charges: patch.charges, max: maxCharges });
    }
  }

  // Solo bloqueamos si la transición es false → true. true → true (no-op) o true → false (untune) pasan.
  if (patch.attuned === true && !current.attuned) {
    const otherAttuned = inventory.reduce(
      (acc, it, i) => acc + (i !== idx && it.attuned ? 1 : 0),
      0,
    );
    if (otherAttuned >= ATTUNEMENT_MAX) {
      issues.push({ code: 'ATTUNEMENT_CAP_EXCEEDED', max: ATTUNEMENT_MAX, current: otherAttuned });
    }
  }

  // Container move: valida que el target exista, sea container y no forme ciclo.
  if (patch.containerId !== undefined) {
    const containerIssue = validateContainerMove({
      inventory,
      instanceId,
      targetContainerId: patch.containerId,
      weights,
    });
    if (containerIssue) issues.push(containerIssue);
  }

  if (issues.length > 0) return { ok: false, issues };

  const updated: InventoryItem = {
    ...current,
    ...(patch.quantity !== undefined && { quantity: patch.quantity }),
    ...(patch.state !== undefined && { state: patch.state }),
    ...(patch.attuned !== undefined && { attuned: patch.attuned }),
    ...(patch.customName !== undefined && { customName: patch.customName }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.equipHand !== undefined && { equipHand: patch.equipHand }),
    ...(patch.charges !== undefined && { charges: patch.charges }),
    ...(patch.containerId !== undefined && { containerId: patch.containerId }),
  };

  const nextInventory = [...inventory];
  nextInventory[idx] = updated;

  // Si el ítem termina equipped o cambió de equipHand, validar slots.
  if (updated.state === 'equipped') {
    const lookup = new Map<string, ItemCompendiumLite>();
    for (const w of weights) lookup.set(`${w.slug}|${w.source}`, w);
    lookup.set(`${itemData.slug}|${itemData.source}`, itemData);
    const slotIssues = checkEquipSlots(nextInventory, lookup);
    if (slotIssues.length > 0) return { ok: false, issues: slotIssues };
  }

  const warnings = collectWarnings(nextInventory, updated, itemData, weights, ctx);

  return { ok: true, inventory: nextInventory, warnings };
}

/**
 * Quita una instancia. Si no existe → INSTANCE_NOT_FOUND.
 * Si la instancia era container, sus hijos se reparentean a root
 * (containerId = null) — los items "se caen" del container, no se borran.
 * Como remove nunca puede causar encumbrance, no devuelve warnings.
 */
export function removeItemFromInventory(args: {
  inventory: InventoryItem[];
  instanceId: string;
}): InventoryOpResult {
  const { inventory, instanceId } = args;
  const exists = inventory.some((it) => it.instanceId === instanceId);
  if (!exists) {
    return { ok: false, issues: [{ code: 'INSTANCE_NOT_FOUND', instanceId }] };
  }
  const filtered = inventory.filter((it) => it.instanceId !== instanceId);
  const reparented = filtered.map((it) =>
    it.containerId === instanceId ? { ...it, containerId: null } : it,
  );
  return {
    ok: true,
    inventory: reparented,
    warnings: [],
  };
}

/**
 * Calcula warnings activos para el inventario completo:
 * - Encumbrance: si total weight > STR×15.
 * - Proficiency: por cada ítem equipped con kind armor/shield/weapon sin prof.
 *
 * Exportada para que el sheet calculator y los handlers PATCH la reutilicen.
 */
export function collectWarnings(
  inventory: InventoryItem[],
  /** Si la op acaba de agregar/cambiar un ítem, podés pasarlo para enfocarte solo en él. */
  changed: InventoryItem | null,
  itemData: ItemCompendiumLite | null,
  weights: ReadonlyArray<ItemCompendiumLite>,
  ctx: InventoryContext,
): InventoryWarning[] {
  const warnings: InventoryWarning[] = [];

  // Encumbrance — evaluado sobre el inventario completo.
  const lookup = buildWeightLookup(weights);
  const weight = totalWeight(inventory, lookup);
  const max = carryingCapacity(ctx.strScore);
  if (weight > max) {
    warnings.push({ code: 'ENCUMBERED', weight, max });
  }

  // CAPACITY_EXCEEDED — por cada container con capacidad de peso definida,
  // si el contenido directo supera la capacidad, emitir warning.
  for (const it of inventory) {
    const lite = lookup.get(`${it.itemSlug}|${it.itemSource}`);
    const cap = lite?.containerCapacity;
    if (cap == null || cap.weightLb == null) continue;
    const contentsWeight = containerContentsWeight(it.instanceId, inventory, lookup);
    if (contentsWeight > cap.weightLb) {
      warnings.push({
        code: 'CAPACITY_EXCEEDED',
        containerId: it.instanceId,
        weight: contentsWeight,
        capacityLb: cap.weightLb,
      });
    }
  }

  // Proficiency warning: solo si el ítem cambiado pasó a estar equipped.
  if (changed && changed.state === 'equipped' && itemData) {
    const prof = checkEquippedProficiency(itemData, ctx);
    if (!prof.proficient && prof.kind !== 'other') {
      warnings.push({
        code: 'EQUIPPED_WITHOUT_PROFICIENCY',
        instanceId: changed.instanceId,
        itemSlug: changed.itemSlug,
        itemSource: changed.itemSource,
        kind: prof.kind,
      });
    }
  }

  return warnings;
}

/**
 * Consume cargas o uses de una instancia.
 *
 * Modo de operación según el compendio:
 * - Si `itemData.charges != null` (wand, lodestone) → decrementa `charges`.
 *   Falla con INSUFFICIENT_CHARGES si `count > current`.
 * - Si no, pero `itemData.type` es potion ('P') o scroll ('SC') → decrementa
 *   `quantity`. Si llega a 0 → elimina la instancia. Falla con
 *   INSUFFICIENT_QUANTITY si `count > quantity`.
 * - En cualquier otro caso → ITEM_NOT_CONSUMABLE.
 *
 * No emite warnings (consume nunca cambia encumbrance ni equip slots; aunque
 * remueva, el peso solo baja).
 */
export function consumeInventoryItem(args: {
  inventory: InventoryItem[];
  instanceId: string;
  itemData: ItemCompendiumLite;
  count?: number;
}): InventoryOpResult & { consumed?: ConsumedReport } {
  const { inventory, instanceId, itemData } = args;
  const count = args.count ?? 1;
  const issues: InventoryValidationIssue[] = [];

  if (!Number.isInteger(count) || count < 1) {
    issues.push({ code: 'QUANTITY_INVALID', quantity: count, min: 1 });
    return { ok: false, issues };
  }

  const idx = inventory.findIndex((it) => it.instanceId === instanceId);
  if (idx === -1) {
    return { ok: false, issues: [{ code: 'INSTANCE_NOT_FOUND', instanceId }] };
  }
  const current = inventory[idx]!;

  // Charges path.
  if (itemData.charges != null) {
    const available = current.charges ?? itemData.charges;
    if (count > available) {
      return {
        ok: false,
        issues: [{ code: 'INSUFFICIENT_CHARGES', requested: count, available }],
      };
    }
    const remaining = available - count;
    const nextInventory = [...inventory];
    nextInventory[idx] = { ...current, charges: remaining };
    return {
      ok: true,
      inventory: nextInventory,
      warnings: [],
      consumed: { instanceId, mode: 'charges', count, removed: false, remaining },
    };
  }

  // Quantity-consumable path (potions, scrolls).
  if (isQuantityConsumable(itemData)) {
    if (count > current.quantity) {
      return {
        ok: false,
        issues: [{ code: 'INSUFFICIENT_QUANTITY', requested: count, available: current.quantity }],
      };
    }
    const remaining = current.quantity - count;
    if (remaining === 0) {
      return {
        ok: true,
        inventory: inventory.filter((it) => it.instanceId !== instanceId),
        warnings: [],
        consumed: { instanceId, mode: 'quantity', count, removed: true, remaining: 0 },
      };
    }
    const nextInventory = [...inventory];
    nextInventory[idx] = { ...current, quantity: remaining };
    return {
      ok: true,
      inventory: nextInventory,
      warnings: [],
      consumed: { instanceId, mode: 'quantity', count, removed: false, remaining },
    };
  }

  return {
    ok: false,
    issues: [
      { code: 'ITEM_NOT_CONSUMABLE', itemSlug: itemData.slug, itemSource: itemData.source },
    ],
  };
}

/**
 * Trigger type for item recharge on rest.
 *
 * PHB p.141: magic items regain charges at dawn, at the end of a short rest,
 * or at the end of a long rest.
 *
 * - `'short'`  → recharges items with `recharge === 'short'`
 * - `'long'`   → recharges items with `recharge === 'long'` OR `recharge === 'dawn'`
 *               (R-04 DOC deferral: dawn items are long-rest-equivalent until the
 *               campaign clock is implemented — parent roadmap rules-audit-rest D-03)
 * - `'dawn'`   → recharges only items with `recharge === 'dawn'`
 */
export type RechargeTrigger = 'short' | 'long' | 'dawn';

/**
 * Recarga charges en items cuyo compendio coincide con el trigger de descanso.
 * PHB p.141. Items sin charges o cuyo recharge no coincide con el trigger no
 * se tocan.
 *
 * Devuelve el inventario nuevo + lista de instanceIds recargados.
 *
 * @param trigger - El tipo de descanso que dispara la recarga.
 *   Defaults to `'long'` for backward-compatibility with existing call sites.
 */
export function rechargeInventoryItems(args: {
  inventory: InventoryItem[];
  weights: ReadonlyArray<ItemCompendiumLite>;
  /** PHB p.141 — which rest triggers this recharge. Default: 'long'. */
  trigger?: RechargeTrigger;
}): { inventory: InventoryItem[]; recharged: Array<{ instanceId: string; to: number }> } {
  const { inventory, weights, trigger = 'long' } = args;
  const lookup = new Map<string, ItemCompendiumLite>();
  for (const w of weights) lookup.set(`${w.slug}|${w.source}`, w);

  /** Returns true if a given recharge value should fire for this trigger. */
  function matchesTrigger(recharge: string | null | undefined): boolean {
    if (!recharge) return false;
    switch (trigger) {
      case 'short':
        return recharge === 'short';
      case 'long':
        // R-04 DOC deferral: 'dawn' items are treated as long-rest-equivalent
        // until the campaign clock is implemented. PHB p.141.
        return recharge === 'long' || recharge === 'dawn';
      case 'dawn':
        return recharge === 'dawn';
    }
  }

  const recharged: Array<{ instanceId: string; to: number }> = [];
  const nextInventory = inventory.map((it) => {
    const lite = lookup.get(`${it.itemSlug}|${it.itemSource}`);
    if (!lite || lite.charges == null) return it;
    if (!matchesTrigger(lite.recharge)) return it;
    if (it.charges === lite.charges) return it;
    recharged.push({ instanceId: it.instanceId, to: lite.charges });
    return { ...it, charges: lite.charges };
  });

  return { inventory: nextInventory, recharged };
}

export type { ItemState };
