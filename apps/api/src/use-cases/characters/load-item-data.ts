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
}): ItemCompendiumLite {
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
