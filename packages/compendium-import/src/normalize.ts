/**
 * Sources que NUNCA importamos: 2024 (XPHB, XDMG, XMM) y UA / playtest.
 * El Rules Profile filtra el resto en runtime.
 */
const EXCLUDED_SOURCES_EXACT = new Set([
  'XPHB',   // 2024 Player's Handbook
  'XDMG',   // 2024 Dungeon Master's Guide
  'XMM',    // 2024 Monster Manual
  'XPsiHB', // psionics 2024
]);

const EXCLUDED_SOURCES_PREFIX = ['UA']; // UAArtificer, UAClericDivineDomains, etc.

export function isExcludedSource(source: string): boolean {
  if (EXCLUDED_SOURCES_EXACT.has(source)) return true;
  return EXCLUDED_SOURCES_PREFIX.some((prefix) => source.startsWith(prefix));
}

/**
 * Convierte "Half-Elf" → "half-elf", "Bag of Holding" → "bag-of-holding".
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 5etools reprintedAs viene en dos formatos:
 *   - string:  "Name|Source"
 *   - object:  { uid: "Name|Source", tag: "feat" } (cuando el reprint cambia
 *              de tipo, ej: una subraza que pasó a ser feat en una versión nueva)
 *
 * Normalizamos ambos a "slug|SOURCE". El `tag` se descarta acá — la info
 * completa sigue en el JSONB `data` si después la necesitamos.
 */
type ReprintedAsEntry = string | { uid?: string; tag?: string };

export function parseReprintedAs(arr: ReprintedAsEntry[] | undefined): string[] | null {
  if (!arr || arr.length === 0) return null;
  const result = arr
    .map((entry) => {
      const raw = typeof entry === 'string' ? entry : entry.uid;
      if (typeof raw !== 'string') return null;
      const parts = raw.split('|');
      const name = parts[0];
      const src = parts[1];
      if (!name || !src) return null;
      return `${slugify(name)}|${src}`;
    })
    .filter((x): x is string => x !== null);
  return result.length > 0 ? result : null;
}
