import { eq } from 'drizzle-orm';
import type { Modifier, ModifierInstance, ModifierInstanceId, DurationSpec, EvaluationContext } from '@dungeon-hub/domain/engine';
import { evaluateDuration } from '@dungeon-hub/domain/engine';
import type { Predicate } from '@dungeon-hub/domain/engine';
import type { TargetScope } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { modifierInstances } from '../../infra/db/schema.js';

/**
 * Loads all persisted modifier instances targeting a given character, filtered
 * through evaluateDuration to exclude expired instances before registry build.
 *
 * GENERIC — zero knowledge of Bless or any specific modifier kind.
 * Returns fully hydrated ModifierInstance[] for registration into the
 * in-memory registry at read time (derive-on-read pattern, mirrors Slice 4).
 *
 * engine-timeline-duration: signature gains ctx (REQ-DUR-LOAD-01):
 *   - row.startRound promoted to instance.startRound via conditional spread
 *     (exactOptionalPropertyTypes: never assign undefined — omit the key)
 *   - each instance is passed through evaluateDuration(instance, ctx)
 *   - instances where evaluateDuration returns false are excluded from result
 *   - legacy rows with start_round=NULL fall through to the conservative fallback
 *     (evaluateDuration returns true) — read-path tolerance (REQ-DUR-TOLERATE-01)
 *
 * Row → instance mapping:
 *   id                = row.id as ModifierInstanceId
 *   def               = row.def as Modifier
 *   scope             = row.scope as ModifierInstance['scope']
 *   predicate         = conditionally spread (omit when null — exactOptionalPropertyTypes)
 *   duration          = conditionally spread (omit when null — exactOptionalPropertyTypes)
 *   label             = conditionally spread (omit when null — exactOptionalPropertyTypes)
 *   startRound        = conditionally spread (omit when null — exactOptionalPropertyTypes)
 *
 * Design ref: sdd/engine-timeline-duration/design — ADR-3; REQ-DUR-LOAD-01.
 * Design ref: sdd/engine-stateful/design #1131 — D3; tasks #1132 — T3.
 */
export async function loadPersistedModifiers(
  targetCharacterId: string,
  ctx: EvaluationContext,
): Promise<ModifierInstance[]> {
  const rows = await db
    .select()
    .from(modifierInstances)
    .where(eq(modifierInstances.targetCharacterId, targetCharacterId));

  const instances: ModifierInstance[] = rows.map((row) => {
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
      // engine-timeline-duration: promote start_round column to domain type field.
      // NULL rows omit the key → evaluateDuration sees startRound=undefined → fallback active.
      ...(row.startRound != null ? { startRound: row.startRound } : {}),
    };
  });

  // engine-timeline-duration: filter expired instances BEFORE registry build.
  // Instances where evaluateDuration returns false are excluded from the registry
  // and will not contribute to resolveStat (REQ-DUR-LOAD-01, ADR-3).
  return instances.filter((inst) => evaluateDuration(inst, ctx));
}
