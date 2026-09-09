// Custom content via JSON upload — items only (MVP #3.8, DEC-1 locked
// 2026-06-04: JSON upload, not visual authoring).
//
// Pure parse/validate step for the DM-pasted textarea content, kept OUT of
// actions.ts on purpose: a 'use server' file may only export async server
// actions, so this plain sync helper lives beside it instead — also makes
// it directly unit-testable without spinning up a Server Action.
//
// Mirrors the API's Zod body shape (apps/api/src/http/routes/homebrew.ts)
// so most shape mistakes are caught here, in Spanish, before the round
// trip — the API is still the enforcement authority (its own Zod parse
// runs regardless of this check).

export interface ParsedHomebrewItem {
  name: string;
  type?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

export type ParseHomebrewJsonResult =
  | { ok: true; items: ParsedHomebrewItem[] }
  | { ok: false; error: string };

const MAX_ITEMS = 200;
const MAX_NAME_LENGTH = 120;

export function parseHomebrewItemsJson(raw: string): ParseHomebrewJsonResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Pegá un array JSON con al menos un item.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: 'El texto no es JSON válido. Revisá comas, comillas y corchetes.',
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'El JSON debe ser un array de items, ej: [{ "name": "Espada Rota" }].',
    };
  }
  if (parsed.length === 0) {
    return { ok: false, error: 'El array está vacío — agregá al menos un item.' };
  }
  if (parsed.length > MAX_ITEMS) {
    return {
      ok: false,
      error: `Demasiados items (${parsed.length}). El máximo por carga es ${MAX_ITEMS}.`,
    };
  }

  const items: ParsedHomebrewItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entryRaw = parsed[i];
    if (typeof entryRaw !== 'object' || entryRaw === null || Array.isArray(entryRaw)) {
      return { ok: false, error: `El item #${i + 1} no es un objeto.` };
    }
    const entry = entryRaw as Record<string, unknown>;

    const name = entry.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false, error: `El item #${i + 1} necesita un "name" (texto no vacío).` };
    }
    if (name.length > MAX_NAME_LENGTH) {
      return {
        ok: false,
        error: `El item #${i + 1}: "name" no puede superar los ${MAX_NAME_LENGTH} caracteres.`,
      };
    }

    const item: ParsedHomebrewItem = { name };

    if (entry.type !== undefined) {
      if (typeof entry.type !== 'string') {
        return { ok: false, error: `El item #${i + 1}: "type" debe ser texto.` };
      }
      item.type = entry.type;
    }

    if (entry.weight !== undefined) {
      if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight) || entry.weight < 0) {
        return { ok: false, error: `El item #${i + 1}: "weight" debe ser un número ≥ 0.` };
      }
      item.weight = entry.weight;
    }

    if (entry.data !== undefined) {
      if (typeof entry.data !== 'object' || entry.data === null || Array.isArray(entry.data)) {
        return { ok: false, error: `El item #${i + 1}: "data" debe ser un objeto.` };
      }
      item.data = entry.data as Record<string, unknown>;
    }

    items.push(item);
  }

  return { ok: true, items };
}

/** Example payload shown on the page so a DM knows what to paste. */
export const HOMEBREW_JSON_EXAMPLE = `[
  {
    "name": "Espada del Alba",
    "type": "M",
    "weight": 3,
    "data": { "rarity": "rare", "entries": ["+1 a los ataques cuerpo a cuerpo."] }
  }
]`;
