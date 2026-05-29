import { eq } from 'drizzle-orm';
import type { Modifier, ModifierInstance, ModifierInstanceId, DurationSpec } from '@dungeon-hub/domain/engine';
import type { Predicate } from '@dungeon-hub/domain/engine';
import type { TargetScope } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { modifierInstances } from '../../infra/db/schema.js';

/**
 * Loads all persisted modifier instances targeting a given character.
 *
 * GENERIC — zero knowledge of Bless or any specific modifier kind.
 * Returns fully hydrated ModifierInstance[] for registration into the
 * in-memory registry at read time (derive-on-read pattern, mirrors Slice 4).
 *
 * Row → instance mapping:
 *   id                = row.id as ModifierInstanceId
 *   def               = row.def as Modifier
 *   scope             = row.scope as ModifierInstance['scope']
 *   predicate         = conditionally spread (omit when null — exactOptionalPropertyTypes)
 *   duration          = conditionally spread (omit when null — exactOptionalPropertyTypes)
 *   label             = conditionally spread (omit when null — exactOptionalPropertyTypes)
 *
 * Design ref: sdd/engine-stateful/design #1131 — D3; tasks #1132 — T3.
 */
export async function loadPersistedModifiers(targetCharacterId: string): Promise<ModifierInstance[]> {
  const rows = await db
    .select()
    .from(modifierInstances)
    .where(eq(modifierInstances.targetCharacterId, targetCharacterId));

  return rows.map((row) => {
    const base = {
      id: row.id as ModifierInstanceId,
      def: row.def as Modifier,
      scope: row.scope as {
        owner: ModifierInstance['scope']['owner'];
        target: TargetScope;
        trigger: ModifierInstance['scope']['trigger'];
      },
    };

    // exactOptionalPropertyTypes: NEVER assign null/undefined to optional fields.
    // Spread the field only when it has a real value — otherwise omit the key entirely.
    return {
      ...base,
      ...(row.predicate != null ? { predicate: row.predicate as Predicate } : {}),
      ...(row.duration != null ? { duration: row.duration as DurationSpec } : {}),
      ...(row.label != null ? { label: row.label } : {}),
    };
  });
}
