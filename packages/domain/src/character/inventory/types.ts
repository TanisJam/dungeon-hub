/**
 * Inventario Fase A — modelo flat por instancia.
 *
 * Decisiones canónicas (CONSTRAINTS.md §7.1):
 * - Attunement máx 3 ítems con `attuned: true` (PHB p.138, hard rule).
 * - Carga > STR × 15 → warning, no bloquea.
 * - Equipar arma/armadura sin proficiency → warning, no bloquea.
 * - Currency separado en `data.currency` (no en este módulo).
 */

export const ITEM_STATES = ['equipped', 'carried', 'stowed'] as const;
export type ItemState = (typeof ITEM_STATES)[number];

export interface InventoryItem {
  /** UUID generado al agregar. Estable para PATCH/DELETE. */
  instanceId: string;
  itemSlug: string;
  itemSource: string;
  quantity: number;
  state: ItemState;
  attuned: boolean;
  customName: string | null;
  notes: string;
  /**
   * Slot de mano cuando state='equipped' y el ítem es un arma. Default 'main'.
   * Two-handed weapons exigen 'both'. Light weapons aceptan dual-wield ('main' y
   * otro 'off' en simultáneo).
   * Para armaduras y shields, este campo no aplica (queda null).
   */
  equipHand?: 'main' | 'off' | 'both' | null;
  /**
   * Cargas restantes (per-instance). Solo se setea si el compendio define
   * `charges` para el ítem (wands, lodestones, etc.). null para items sin
   * sistema de charges (incluidos consumibles tipo potion/scroll que se
   * consumen vía quantity).
   */
  charges?: number | null;
  /**
   * `instanceId` del container que contiene este ítem. null = top-level (en
   * las manos / pecho del personaje, no adentro de nada). Solo puede apuntar
   * a un instance cuyo compendio define `containerCapacity`.
   * NOTA (combat): el state ('equipped'/'carried'/'stowed') es ortogonal al
   * containerId. Un longsword "carried" puede estar adentro de un backpack;
   * la UI decide qué mostrar.
   */
  containerId?: string | null;
}

/** Subset del compendio que necesita el validador. Lo carga el caller. */
export interface ItemCompendiumLite {
  slug: string;
  source: string;
  name: string;
  /** 5etools type code: 'M' (melee), 'R' (ranged), 'LA', 'MA', 'HA', 'S' (shield), etc. */
  type: string | null;
  /** Libras. Puede ser null en magic items sin peso definido. */
  weight: number | null;
  /**
   * Propiedades del ítem (solo aplica a weapons): "V" (versatile), "L" (light),
   * "H" (heavy), "2H" (two-handed), "F" (finesse), "T" (thrown), "R" (reach),
   * "A" (ammunition), "LD" (loading), "S" (special), "RLD" (reload).
   * Default `[]`.
   */
  property?: string[];
  /**
   * Máximo de charges definido por el compendio. null si el ítem no tiene
   * sistema de charges.
   */
  charges?: number | null;
  /**
   * Timing de recarga del compendio. Solo nos importa 'dawn' (long rest).
   * Otros valores (turn/action/dusk/etc.) se ignoran en rest handlers.
   */
  recharge?: 'dawn' | 'dusk' | 'short' | 'long' | string | null;
  /**
   * Base armor class for body armor (5etools `ac`). PHB p.144 — Armor table.
   * Examples: leather=11, chain shirt=13, plate=18. Undefined for non-armor.
   */
  ac?: number;
  /**
   * True when wearing this armor imposes disadvantage on Stealth checks
   * (PHB p.144). Reflects 5etools `stealth` flag. Undefined for non-armor.
   */
  stealth?: boolean;
  /**
   * Minimum STR score required to avoid the heavy-armor speed penalty
   * (PHB p.144 — e.g. plate=15, splint=15, chain mail=13). Undefined when
   * the armor has no STR requirement. Maps from 5etools `strength` field.
   */
  armorStrengthMin?: number;
  /**
   * Si el ítem es un container, define su capacidad y si "cancela" el peso
   * del contenido (Bag of Holding, Heward's Handy Haversack, etc.). null si
   * no es un container.
   *
   * `weightLb`: suma del array `containerCapacity.weight` del compendio
   * (sumado a través de compartimentos). null cuando el compendio solo
   * define `containerCapacity.item` (capacidad por count). En ese caso no
   * emitimos CAPACITY_EXCEEDED.
   *
   * `weightless`: si true, el peso del contenido (transitivo) NO suma al
   * encumbrance del wearer. El peso propio del container sí cuenta.
   *
   * TODO (combat / RAW): manejar BoH dentro de BoH (RAW: portal al Astral).
   */
  containerCapacity?: { weightLb: number | null; weightless: boolean } | null;
}

/**
 * Contexto del personaje al momento de la operación. Lo arma el caller a partir
 * de `character.data` (effective stats, profs, inventory actual).
 */
export interface InventoryContext {
  /** STR efectivo (base + ASIs) para el cap de carga. */
  strScore: number;
  /** Strings tal cual el compendio: "light", "heavy", "shields", etc. */
  armorProficiencies: string[];
  /** Strings tal cual el compendio: "simple weapons", "longsword", etc. */
  weaponProficiencies: string[];
}

export type InventoryValidationIssue =
  | { code: 'ATTUNEMENT_CAP_EXCEEDED'; max: 3; current: number }
  | { code: 'ITEM_NOT_FOUND'; item: { slug: string; source: string } }
  | { code: 'INSTANCE_NOT_FOUND'; instanceId: string }
  | { code: 'QUANTITY_INVALID'; quantity: number; min: 1 }
  | { code: 'BODY_ARMOR_SLOT_FULL'; currentInstanceId: string }
  | { code: 'SHIELD_SLOT_FULL'; currentInstanceId: string }
  | {
      code: 'HANDS_EXCEEDED';
      handsUsed: number;
      handsMax: number;
      detail: string;
    }
  | {
      /** Two-handed weapon que se intenta equipar como 'main' u 'off' sin 'both'. */
      code: 'TWO_HANDED_REQUIRES_BOTH';
      itemSlug: string;
      itemSource: string;
    }
  | {
      /** Off-hand weapon que no es light (PHB p.195: dual-wield necesita light). */
      code: 'OFF_HAND_REQUIRES_LIGHT';
      itemSlug: string;
      itemSource: string;
    }
  | {
      /** Charges iniciales > máximo definido por compendio. */
      code: 'CHARGES_EXCEEDS_MAX';
      charges: number;
      max: number;
    }
  | {
      /** Ítem no tiene charges ni es potion/scroll → no se puede consumir. */
      code: 'ITEM_NOT_CONSUMABLE';
      itemSlug: string;
      itemSource: string;
    }
  | {
      /** consume(count) y count > charges actuales. */
      code: 'INSUFFICIENT_CHARGES';
      requested: number;
      available: number;
    }
  | {
      /** consume(count) sobre potion/scroll y count > quantity actual. */
      code: 'INSUFFICIENT_QUANTITY';
      requested: number;
      available: number;
    }
  | {
      /** containerId apunta a un instanceId que no existe. */
      code: 'CONTAINER_NOT_FOUND';
      containerId: string;
    }
  | {
      /** containerId apunta a un ítem que no es un container. */
      code: 'NOT_A_CONTAINER';
      containerId: string;
      itemSlug: string;
      itemSource: string;
    }
  | {
      /** Mover este ítem dentro del nuevo container crearía un ciclo
       * (target es el mismo ítem o un descendiente). */
      code: 'CONTAINER_CYCLE';
      instanceId: string;
      attemptedContainerId: string;
    };

export type InventoryWarning =
  | {
      code: 'ENCUMBERED';
      weight: number;
      max: number;
    }
  | {
      code: 'EQUIPPED_WITHOUT_PROFICIENCY';
      instanceId: string;
      itemSlug: string;
      itemSource: string;
      kind: 'armor' | 'shield' | 'weapon';
    }
  | {
      /** Contenido de un container supera su weightCap (PHB / DMG). No bloquea. */
      code: 'CAPACITY_EXCEEDED';
      containerId: string;
      weight: number;
      capacityLb: number;
    };

export interface AddItemInput {
  quantity?: number;
  state?: ItemState;
  attuned?: boolean;
  customName?: string | null;
  notes?: string;
  /** Solo aplica si state='equipped' y el ítem es weapon. Default 'main'. */
  equipHand?: 'main' | 'off' | 'both' | null;
  /**
   * Charges iniciales. Si se omite y el compendio define charges, se setea al
   * máximo (item llega "lleno"). Si el compendio no define charges, este
   * campo se ignora (queda null).
   */
  charges?: number | null;
  /** Si se pasa, el ítem se agrega adentro del container indicado. null = root. */
  containerId?: string | null;
}

/** Patch parcial. Cualquier campo undefined no se toca. */
export interface UpdateItemInput {
  quantity?: number;
  state?: ItemState;
  attuned?: boolean;
  customName?: string | null;
  notes?: string;
  equipHand?: 'main' | 'off' | 'both' | null;
  /** Set explícito de charges. null = quitarlas (el item ya no trackea). */
  charges?: number | null;
  /** Mover el ítem a un container distinto. null = mover a root. */
  containerId?: string | null;
}

export type InventoryOpResult =
  | {
      ok: true;
      inventory: InventoryItem[];
      warnings: InventoryWarning[];
      addedInstanceId?: string;
      /** Solo presente cuando la op fue un consume. */
      consumed?: ConsumedReport;
    }
  | { ok: false; issues: InventoryValidationIssue[] };

/** Detalle de qué pasó al consumir un ítem. */
export interface ConsumedReport {
  instanceId: string;
  /** 'charges' decrementó charges; 'quantity' decrementó stack (potion/scroll). */
  mode: 'charges' | 'quantity';
  count: number;
  /** Quedó en cero y se eliminó del inventario (solo aplica en mode='quantity'). */
  removed: boolean;
  remaining: number;
}
