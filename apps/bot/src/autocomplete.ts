import { api } from './api-client.js';
import { env } from './env.js';

/**
 * Format que Discord espera para autocomplete choices.
 * Límites: name max 100 chars, value max 100 chars, hasta 25 opciones.
 */
export interface ChoiceDTO {
  name: string;
  value: string;
}

/**
 * Listing rows que devuelven los endpoints /compendium/{kind}. Cada kind tiene
 * campos extra (level, school, isSubrace) — picamos solo lo común acá.
 */
interface CommonRow {
  slug: string;
  source: string;
  name: string;
}

interface RaceRow extends CommonRow {
  isSubrace: boolean;
}

interface SpellRow extends CommonRow {
  level: number;
  school: string;
}

type ListResponse<T> = { data: T[] };

export type Resource = 'spells' | 'feats' | 'items' | 'races' | 'classes';

const ENDPOINT: Record<Resource, string> = {
  spells: '/api/v1/compendium/spells',
  feats: '/api/v1/compendium/feats',
  items: '/api/v1/compendium/items',
  races: '/api/v1/compendium/races',
  classes: '/api/v1/compendium/classes',
};

/**
 * Encode value como `{slug}|{source}` para que el execute pueda hacer lookup
 * directo sin re-buscar. Discord acepta cualquier string en value.
 */
export function encodeChoiceValue(row: CommonRow): string {
  return `${row.slug}|${row.source}`;
}

/**
 * Decode el value pasado por autocomplete. Si no contiene `|`, asumimos que fue
 * texto raw del user (no eligió de la lista).
 */
export function decodeChoiceValue(
  value: string,
): { slug: string; source: string } | null {
  const idx = value.indexOf('|');
  if (idx === -1) return null;
  const slug = value.slice(0, idx);
  const source = value.slice(idx + 1);
  if (!slug || !source) return null;
  return { slug, source };
}

/**
 * Labels específicos por resource.
 */
function labelForRow(resource: Resource, row: CommonRow): string {
  if (resource === 'spells') {
    const s = row as SpellRow;
    const lvl = s.level === 0 ? 'cantrip' : `lvl ${s.level}`;
    return truncateLabel(`${s.name} (${s.source}, ${lvl})`);
  }
  if (resource === 'races') {
    const r = row as RaceRow;
    const marker = r.isSubrace ? ' subrace' : '';
    return truncateLabel(`${r.name}${marker} (${r.source})`);
  }
  return truncateLabel(`${row.name} (${row.source})`);
}

function truncateLabel(label: string): string {
  return label.length > 100 ? label.slice(0, 99) + '…' : label;
}

/**
 * Busca matches para autocomplete. Si query es vacía devuelve [] — Discord espera
 * algún input antes de mostrar opciones.
 */
export async function fetchAutocomplete(
  resource: Resource,
  query: string,
): Promise<ChoiceDTO[]> {
  const trimmed = query.replace(/[-_]+/g, ' ').trim();
  if (!trimmed) return [];

  try {
    const list = await api.get<ListResponse<CommonRow>>(ENDPOINT[resource], {
      campaign: env.CAMPAIGN_ID,
      q: trimmed,
      limit: 25,
    });
    return list.data.map((row) => ({
      name: labelForRow(resource, row),
      value: encodeChoiceValue(row),
    }));
  } catch (err) {
    console.error(`[autocomplete ${resource}] failed:`, err);
    return [];
  }
}
