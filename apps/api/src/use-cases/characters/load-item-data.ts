import { and, eq, inArray } from 'drizzle-orm';
import type { ItemCompendiumLite } from '@dungeon-hub/domain/character/inventory';
import { db } from '../../infra/db/client.js';
import { compendiumItems } from '../../infra/db/schema.js';

function parseWeight(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function extractProperty(data: unknown): string[] {
  if (data == null || typeof data !== 'object') return [];
  const p = (data as Record<string, unknown>)['property'];
  if (!Array.isArray(p)) return [];
  return p.filter((x): x is string => typeof x === 'string');
}

function extractCharges(data: unknown): number | null {
  if (data == null || typeof data !== 'object') return null;
  const c = (data as Record<string, unknown>)['charges'];
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return null;
  return Math.floor(c);
}

/**
 * Maps raw 5etools `recharge` strings to domain Recharge values.
 *
 * PHB p.141 / 5etools alignment:
 * - `"restLong"` → `'long'`  (5etools value for "recharges on long rest")
 * - `"restShort"` → `'short'` (defensive; mirrors restLong — not in PHB data today)
 * - `"dawn"` → `'dawn'`      (pass-through, already a domain value)
 *
 * Unknown values pass through unchanged — the domain `recharge` field
 * permits `string | null` as an escape hatch for future/custom values.
 * REQ-R02-EXTRACT-RECHARGE-UNKNOWN.
 *
 * Exported for unit testing.
 */
export const RECHARGE_5ETOOLS_MAP: Record<string, string> = {
  dawn: 'dawn',
  restLong: 'long',
  restShort: 'short', // defensive; parallels restLong; not in PHB data today
};

function extractRecharge(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const r = (data as Record<string, unknown>)['recharge'];
  if (typeof r !== 'string' || r.length === 0) return null;
  return RECHARGE_5ETOOLS_MAP[r] ?? r;
}

/**
 * Extrae `ac` del JSONB 5etools al shape lite del dominio.
 *
 * PHB p.144 (Armor) + p.149 (Shield). En 5etools:
 * - Body armor (LA/MA/HA): `ac` es el AC base (e.g. leather=11, chain shirt=13, plate=18).
 * - Shield (type='S'): `ac` es el BONUS (e.g. shield=2). `computeArmorClass` lo
 *   interpreta correctamente según `lite.type` — acá solo proyectamos el número.
 *
 * Items que no son armadura ni escudo no tienen `ac` → undefined.
 *
 * Exportado para unit testing.
 */
export function extractAc(data: unknown): number | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const ac = (data as Record<string, unknown>)['ac'];
  if (typeof ac !== 'number' || !Number.isFinite(ac)) return undefined;
  return ac;
}

/**
 * Extrae `stealth` (disadvantage on Stealth checks; PHB p.144) del JSONB.
 *
 * 5etools encodea como `stealth: true` cuando aplica el penalty. Si el flag está
 * ausente o no es boolean, devolvemos undefined.
 *
 * Exportado para unit testing.
 */
export function extractStealth(data: unknown): boolean | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const s = (data as Record<string, unknown>)['stealth'];
  if (typeof s !== 'boolean') return undefined;
  return s;
}

/**
 * Extrae el STR mínimo (`strength`) requerido para evitar el penalty de velocidad
 * en heavy armor (PHB p.144 — plate=15, splint=15, chain mail=13).
 *
 * NOTA 5etools: el campo viene como STRING (`"15"`), no number. Lo parseamos
 * a número. Cualquier valor que no pueda parsearse → undefined.
 *
 * Exportado para unit testing.
 */
export function extractArmorStrengthMin(data: unknown): number | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const raw = (data as Record<string, unknown>)['strength'];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Extrae `rarity` del JSONB 5etools al shape lite del dominio.
 *
 * 5etools encodea la rareza como un string en `data.rarity`
 * (e.g. "common", "uncommon", "rare", "very rare", "legendary", "artifact",
 * "none", "varies"). Devuelve null cuando el campo está ausente o no es string.
 *
 * La normalización a `RarityClass` la hace el caller vía `normalizeRarity`.
 * Design decision sdd/inventory-v3-list/design #1064 — D3.
 * DMG p.135 — Rarity.
 *
 * Exportado para unit testing.
 */
export function extractRarity(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const r = (data as Record<string, unknown>)['rarity'];
  if (typeof r !== 'string' || r.length === 0) return null;
  return r;
}

/**
 * Extrae `reqAttune` del JSONB 5etools al shape lite del dominio.
 *
 * 5etools encodea la atunación requerida como:
 * - `true` → requiere atunación (cualquier clase)
 * - `string` (e.g. "by a spellcaster") → requiere atunación con restricción
 * - absent/null/false → no requiere atunación
 *
 * PHB p.136-138 — Magic Items (Attunement): max 3 items attuned simultaneously.
 * Design decision sdd/inventory-v3-list/design #1064 — D3.
 *
 * Exportado para unit testing.
 */
export function extractReqAttune(data: unknown): boolean | string | null {
  if (data == null || typeof data !== 'object') return null;
  const r = (data as Record<string, unknown>)['reqAttune'];
  if (typeof r === 'boolean') return r || null; // false → null (no attune)
  if (typeof r === 'string' && r.length > 0) return r;
  return null;
}

/**
 * Extrae `costCp` del JSONB 5etools al shape lite del dominio.
 *
 * 5etools encodea el costo en `data.value` como número en copper pieces (CP).
 * Por ejemplo, longsword = 1500 (15 gp × 100 cp/gp). Cuando el campo está
 * ausente o no es numérico → null (magic items, homebrew, etc.).
 *
 * Design decision sdd/inventory-d4-d6/design #890: read-time projection, NO
 * columna `cost_cp` en el schema. El shop SDD agregará la columna cuando sea
 * necesario persistir datos de costo personalizado.
 *
 * Gotcha R5 (proposal #888): `data.value` puede ser string en algunos items
 * de homebrew — siempre parseamos con Number().
 */
/**
 * Extrae `dmg1` del JSONB 5etools (dado de daño primario).
 *
 * PHB p.149 — Weapons table: "1d8" para longsword, "1d6" para shortsword, etc.
 * 5etools encodea como `data.dmg1` (string). Devuelve null cuando ausente.
 *
 * Exportado para unit testing y para projectItemRow({ includeDetail: true }).
 */
export function extractDmg1(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const d = (data as Record<string, unknown>)['dmg1'];
  if (typeof d !== 'string' || d.length === 0) return null;
  return d;
}

/** Maps 5etools damage type codes to Spanish humanized strings (PHB p.149). */
const DMG_TYPE_MAP: Record<string, string> = {
  S: 'Cortante',
  P: 'Perforante',
  B: 'Contundente',
};

/**
 * Extrae `dmgType` del JSONB 5etools y lo humaniza.
 *
 * PHB p.149 — Weapons table damage types:
 *   S = slashing → "Cortante"
 *   P = piercing → "Perforante"
 *   B = bludgeoning → "Contundente"
 * Unknown codes pass-through verbatim. Devuelve null cuando ausente.
 *
 * Exportado para unit testing y para projectItemRow({ includeDetail: true }).
 */
export function extractDmgType(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const d = (data as Record<string, unknown>)['dmgType'];
  if (typeof d !== 'string' || d.length === 0) return null;
  return DMG_TYPE_MAP[d] ?? d;
}

/**
 * Maps 5etools weapon property codes to Spanish humanized labels.
 * PHB p.147-149 — Weapon Properties table.
 */
const PROPERTY_LABEL_MAP: Record<string, string> = {
  F: 'finesse',
  T: 'arrojadiza',
  V: 'versátil',
  L: 'ligera',
  '2H': 'a dos manos',
  H: 'pesada',
  RC: 'recargar',
  MN: 'munición',
  S: 'especial',
  R: 'alcance',
};

/**
 * Humaniza el array de property codes de 5etools a etiquetas legibles.
 * PHB p.147-149 — Weapon Properties.
 *
 * Exportado para uso en projectItemRow({ includeDetail: true }).
 */
export function humanizeWeaponProperties(properties: string[]): string[] {
  return properties.map((p) => PROPERTY_LABEL_MAP[p] ?? p);
}

const ENTRIES_MAX_CHARS = 240;

/**
 * Extrae una descripción resumida de `data.entries[]`.
 *
 * Une los párrafos de texto (strings) en un único string. Omite entradas
 * que son objetos (tablas, listas, etc.). Trunca a 240 chars con ellipsis.
 * Devuelve null cuando `entries` está ausente o no hay texto aprovechable.
 *
 * Exportado para unit testing.
 */
export function extractEntriesSummary(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const entries = (data as Record<string, unknown>)['entries'];
  if (!Array.isArray(entries)) return null;

  const paragraphs = entries.filter((e): e is string => typeof e === 'string');
  if (paragraphs.length === 0) return null;

  const joined = paragraphs.join(' ').trim();
  if (joined.length === 0) return null;

  if (joined.length <= ENTRIES_MAX_CHARS) return joined;
  return joined.slice(0, ENTRIES_MAX_CHARS) + '...';
}

/**
 * Extrae `range` del JSONB 5etools (rango de alcance para armas a distancia o arrojadizas).
 *
 * PHB p.149 — Weapons table: ranged weapons have a normal/long range in feet.
 * 5etools encodea como string (e.g. "20/60", "80/320", "5").
 * Se devuelve verbatim — el renderer agrega el sufijo "ft".
 * Devuelve null cuando ausente (melée sin propiedad de alcance).
 *
 * Exportado para uso en projectItemRow({ includeDetail: true }).
 */
export function extractRange(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const r = (data as Record<string, unknown>)['range'];
  if (typeof r !== 'string' || r.length === 0) return null;
  return r;
}

export function extractCostCp(data: unknown): number | null {
  if (data == null || typeof data !== 'object') return null;
  const raw = (data as Record<string, unknown>)['value'];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && raw.length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * Extrae `containerCapacity` del JSONB 5etools al shape lite del dominio.
 *
 * El shape original tiene:
 *   `{ weight: [number, ...], weightless?: boolean, item?: [...] }`
 *
 * - Sumamos el array de `weight` (compartimentos) en un único cap total. Si
 *   no hay array de weight, weightLb queda en null (capacidad por count,
 *   ver TODO abajo).
 * - `weightless: true` activa la regla de Bag of Holding (contenido no suma
 *   al encumbrance del wearer).
 *
 * TODO (futuro): capacidad por count (`item: [{ "arrow|phb": 20 }]`) requiere
 * lookup por slug — defer hasta que aparezca el sistema de attack.
 */
function extractContainerCapacity(
  data: unknown,
): { weightLb: number | null; weightless: boolean } | null {
  if (data == null || typeof data !== 'object') return null;
  const cap = (data as Record<string, unknown>)['containerCapacity'];
  if (cap == null || typeof cap !== 'object') return null;
  const capObj = cap as Record<string, unknown>;

  const weightArr = capObj['weight'];
  let weightLb: number | null = null;
  if (Array.isArray(weightArr)) {
    const sum = weightArr.reduce<number>((acc, v) => {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return acc + v;
      return acc;
    }, 0);
    if (sum > 0) weightLb = sum;
  }

  const weightless = capObj['weightless'] === true;

  // Si no hay ni weight ni weightless ni item, no es un container "real".
  if (weightLb == null && !weightless && capObj['item'] == null) return null;

  return { weightLb, weightless };
}

export async function loadItemData(input: {
  slug: string;
  source: string;
}): Promise<ItemCompendiumLite | null> {
  const rows = await db
    .select()
    .from(compendiumItems)
    .where(and(eq(compendiumItems.slug, input.slug), eq(compendiumItems.source, input.source)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return projectItemRow(row);
}

/**
 * Extended item compendium data for the detail endpoint.
 * Only used by `loadItemDataDetailMany` — extends `ItemCompendiumLite` with
 * weapon-specific and entry-summary fields needed by the detail renderers.
 *
 * Design: DBE6 (design #1071) — opt-in `includeDetail: true` flag on projectItemRow.
 */
export interface ItemCompendiumDetail extends ItemCompendiumLite {
  /** Primary damage dice string (e.g. "1d8"). PHB p.149. Null for non-weapons. */
  dmg1: string | null;
  /** Humanized damage type (e.g. "Cortante"). PHB p.149. Null for non-weapons. */
  dmgType: string | null;
  /** Range string verbatim from 5etools (e.g. "20/60"). Null for non-ranged. */
  range: string | null;
  /** Humanized property labels array (e.g. ["finesse", "ligera"]). PHB p.147-149. */
  humanizedProperties: string[];
  /** First 240 chars of entries[] text. Null when absent. */
  entriesSummary: string | null;
}

/**
 * Proyecta una row de `compendium_items` al `ItemCompendiumLite`. Single source
 * of truth para la conversión row JSONB → lite domain — compartido entre
 * `loadItemData` (single) y `loadItemDataMany` (batch).
 */
function projectItemRow(row: {
  slug: string;
  source: string;
  name: string;
  type: string | null;
  weight: string | null;
  data: unknown;
}): ItemCompendiumLite;
function projectItemRow(
  row: {
    slug: string;
    source: string;
    name: string;
    type: string | null;
    weight: string | null;
    data: unknown;
  },
  includeDetail: true,
): ItemCompendiumDetail;
function projectItemRow(
  row: {
    slug: string;
    source: string;
    name: string;
    type: string | null;
    weight: string | null;
    data: unknown;
  },
  includeDetail?: boolean,
): ItemCompendiumLite | ItemCompendiumDetail {
  const lite: ItemCompendiumLite = {
    slug: row.slug,
    source: row.source,
    name: row.name,
    type: row.type ?? null,
    weight: parseWeight(row.weight),
    property: extractProperty(row.data),
    charges: extractCharges(row.data),
    recharge: extractRecharge(row.data),
    containerCapacity: extractContainerCapacity(row.data),
  };

  // Armor fields (REQ-CIP-ARMOR-FIELDS + REQ-CIP-LEGACY-MISSING from spec #843).
  // Only attach when present — exactOptionalPropertyTypes is on, so we MUST omit
  // these keys (not set undefined) for non-armor items.
  const ac = extractAc(row.data);
  if (ac !== undefined) lite.ac = ac;
  const stealth = extractStealth(row.data);
  if (stealth !== undefined) lite.stealth = stealth;
  const armorStrengthMin = extractArmorStrengthMin(row.data);
  if (armorStrengthMin !== undefined) lite.armorStrengthMin = armorStrengthMin;

  // Cost projection (REQ-CIP-COST-PROJECTION, sdd/inventory-d4-d6 #889).
  // Always set — null when absent/non-numeric. Consumer must handle null.
  lite.costCp = extractCostCp(row.data);

  // Rarity + attunement projection (sdd/inventory-v3-list #1064 — D3).
  // Always set — null when absent. Consumer normalizes via `normalizeRarity`.
  lite.rarity = extractRarity(row.data);
  lite.reqAttune = extractReqAttune(row.data);

  // Detail projection — only when includeDetail=true (DBE6).
  // Adds weapon-specific fields + entriesSummary for the detail endpoint.
  if (includeDetail) {
    const detail: ItemCompendiumDetail = {
      ...lite,
      dmg1: extractDmg1(row.data),
      dmgType: extractDmgType(row.data),
      range: extractRange(row.data),
      humanizedProperties: humanizeWeaponProperties(lite.property ?? []),
      entriesSummary: extractEntriesSummary(row.data),
    };
    return detail;
  }

  return lite;
}

/**
 * Batch fetch para encumbrance: trae el lite de varias instancias de inventario
 * en una sola query. Si una instancia referencia un slug+source que no existe
 * (ítem custom, etc.), simplemente no aparece en la respuesta y el weight cuenta
 * como 0 (ver totalWeight).
 */
export async function loadItemDataMany(
  refs: ReadonlyArray<{ slug: string; source: string }>,
): Promise<ItemCompendiumLite[]> {
  // R-13 (rest-closeout #826): intentional empty-inventory shortcut — avoids
  // a Drizzle IN-with-empty-array query that some adapters mistranslate. If
  // additional recharge triggers add a second call site for this function on
  // the rest path, consolidate the guard at the caller. DOC-only flag for now.
  if (refs.length === 0) return [];

  const slugs = Array.from(new Set(refs.map((r) => r.slug)));
  // OR-tuples sería ideal pero Drizzle no lo expone limpio — filtramos en JS post-IN.
  const rows = await db
    .select()
    .from(compendiumItems)
    .where(inArray(compendiumItems.slug, slugs));

  const wanted = new Set(refs.map((r) => `${r.slug}|${r.source}`));
  const out: ItemCompendiumLite[] = [];
  for (const row of rows) {
    if (!wanted.has(`${row.slug}|${row.source}`)) continue;
    out.push(projectItemRow(row));
  }
  return out;
}

/**
 * Batch fetch with detail fields for the inventory detail endpoint.
 * Returns `ItemCompendiumDetail` (extends Lite with dmg1/dmgType/range/humanizedProperties/entriesSummary).
 * Single query — zero additional DB round-trips vs. loadItemDataMany.
 *
 * Design: DBE6 (design #1071) — extends projectItemRow with includeDetail=true flag.
 * Used exclusively by `load-inventory-detail.ts`. Existing callers use loadItemDataMany.
 */
export async function loadItemDataDetailMany(
  refs: ReadonlyArray<{ slug: string; source: string }>,
): Promise<ItemCompendiumDetail[]> {
  if (refs.length === 0) return [];

  const slugs = Array.from(new Set(refs.map((r) => r.slug)));
  const rows = await db
    .select()
    .from(compendiumItems)
    .where(inArray(compendiumItems.slug, slugs));

  const wanted = new Set(refs.map((r) => `${r.slug}|${r.source}`));
  const out: ItemCompendiumDetail[] = [];
  for (const row of rows) {
    if (!wanted.has(`${row.slug}|${row.source}`)) continue;
    out.push(projectItemRow(row, true));
  }
  return out;
}
