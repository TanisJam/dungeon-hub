import { listFiles, readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsMonster, NormalizedMonster } from '../types.js';

interface BestiaryFile {
  monster?: FiveeToolsMonster[];
}

/**
 * Parsea "1/8" → 0.125, "10" → 10, etc. Devuelve null si no es parseable.
 * 5etools usa exclusivamente fracciones "1/2", "1/4", "1/8" en strings.
 */
function parseCrNumeric(cr: string): number | null {
  const trimmed = cr.trim();
  if (trimmed === '') return null;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function extractCr(
  raw: FiveeToolsMonster['cr'],
): { cr: string | null; crNumeric: number | null } {
  if (raw == null) return { cr: null, crNumeric: null };
  // 5etools también permite { cr: "10", lair: "11" } — tomamos el base.
  const display = typeof raw === 'string' ? raw : raw.cr;
  if (typeof display !== 'string') return { cr: null, crNumeric: null };
  return { cr: display, crNumeric: parseCrNumeric(display) };
}

function extractType(raw: FiveeToolsMonster['type']): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.toLowerCase();
  if (typeof raw === 'object' && typeof raw.type === 'string') return raw.type.toLowerCase();
  return null;
}

function extractSize(raw: string[] | undefined): string | null {
  if (!raw || raw.length === 0) return null;
  return raw[0] ?? null;
}

/**
 * Carga TODOS los bestiary-*.json y devuelve monsters normalizados.
 *
 * Decisiones:
 * - Excluimos `_copy` (variantes/templates 5etools que requieren resolver
 *   inherit+mod del padre — complejidad alta, baja prioridad para MVP).
 *   El monster base sigue importándose si está separado en el archivo.
 * - Excluimos sources XPHB/XDMG/XMM/UA via isExcludedSource (consistente
 *   con los otros importers).
 * - Dedup post-import en index.ts maneja colisiones (slug, source).
 */
export async function importMonsters(
  dataDir: string,
  warnings: string[],
): Promise<NormalizedMonster[]> {
  const files = await listFiles(dataDir, 'bestiary', /^bestiary-.+\.json$/);
  const out: NormalizedMonster[] = [];

  for (const path of files) {
    const file = await readJson<BestiaryFile>(path);
    for (const m of file.monster ?? []) {
      if (!m.name || !m.source) continue;
      if (isExcludedSource(m.source)) continue;
      if (m._copy != null) {
        // Variantes/templates — skipear es el comportamiento más seguro.
        // El monster "base" del cual copian normalmente está como entry
        // independiente en otro file y se importa por separado.
        continue;
      }

      const { cr, crNumeric } = extractCr(m.cr);
      out.push({
        slug: slugify(m.name),
        source: m.source,
        name: m.name,
        cr,
        crNumeric,
        type: extractType(m.type),
        size: extractSize(m.size),
        data: m,
        reprintedAs: parseReprintedAs(m.reprintedAs),
      });
    }
  }

  if (out.length === 0) {
    warnings.push('No se importó ningún monster — ¿el directorio bestiary/ está vacío?');
  }

  return out;
}
