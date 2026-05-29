/**
 * loadModifierDefinitions — builds an ItemModifierMap from modifier_definitions rows.
 *
 * REQ-MDLOAD-01 (spec sdd/engine-catalog/spec):
 *   - SELECT WHERE kind='item' from modifier_definitions.
 *   - For each row: parseRule → !ok → warn+skip (§11 tolerate-read, NEVER throw).
 *   - For valid rows: compileRule → map[slug] = (charId, itemId) => compiled.build({...}).
 *   - Returns assembled ItemModifierMap.
 *
 * Design D3: param-injection seam. The ROUTE loads the map and passes it down.
 * TODO: module-level cache of compiled map (profile at 50+ rows). Seam = this call site.
 */

import { eq } from 'drizzle-orm';
import { parseRule, compileRule, type ItemModifierMap } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { modifierDefinitions } from '../../infra/db/schema.js';

/**
 * Load all item modifier definitions from the DB and compile them into an ItemModifierMap.
 *
 * Malformed rows are skipped with a console.warn — they NEVER crash the caller.
 * Valid rows are compiled once per call and returned as builder functions.
 */
export async function loadModifierDefinitions(): Promise<ItemModifierMap> {
  const rows = await db
    .select()
    .from(modifierDefinitions)
    .where(eq(modifierDefinitions.kind, 'item'));

  const map: ItemModifierMap = {};

  for (const row of rows) {
    const parseResult = parseRule(row.ruleDoc);
    if (!parseResult.ok) {
      // §11 tolerate-read: warn+skip, never throw. The route stays healthy.
      console.warn(
        `[modifier-definitions] invalid ruleDoc slug=${row.slug}`,
        JSON.stringify(parseResult.issues),
      );
      continue;
    }

    const compiled = compileRule(parseResult.rule);
    // Closure captures the compiled rule; builder is called per-request with live charId/itemId.
    map[row.slug] = (charId, itemId) => compiled.build({ charId, itemId });
  }

  return map;
}
