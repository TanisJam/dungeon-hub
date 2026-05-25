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

function extractRecharge(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const r = (data as Record<string, unknown>)['recharge'];
  if (typeof r !== 'string' || r.length === 0) return null;
  return r;
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
  return {
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
    out.push({
      slug: row.slug,
      source: row.source,
      name: row.name,
      type: row.type ?? null,
      weight: parseWeight(row.weight),
      property: extractProperty(row.data),
      charges: extractCharges(row.data),
      recharge: extractRecharge(row.data),
      containerCapacity: extractContainerCapacity(row.data),
    });
  }
  return out;
}
