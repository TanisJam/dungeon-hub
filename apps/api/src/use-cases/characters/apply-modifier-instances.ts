import type { ModifierInstance } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { modifierInstances } from '../../infra/db/schema.js';

/**
 * Persists an array of ModifierInstances to the DB.
 *
 * GENERIC — zero knowledge of Bless or any specific modifier kind.
 * Any future modifier kind that emits ModifierInstance[] can call this
 * function directly without changes (Rule of Three seam).
 *
 * Instance → row mapping (D3 — one row per instance):
 *   ownerCharacterId   = instance.scope.owner
 *   targetCharacterId  = instance.scope.target.ids[0]  (entities axis, single target per instance)
 *   concentrationToken = instance.duration?.concentrationToken ?? null
 *   def/scope/predicate/duration/label = JSON round-trip as-is
 *
 * Empty array → no-op (no INSERT issued).
 *
 * Design ref: sdd/engine-stateful/design #1131 — D3, D4.
 */
export async function applyModifierInstances(instances: ModifierInstance[]): Promise<void> {
  if (instances.length === 0) return;

  const rows = instances.map((instance) => {
    const target = instance.scope.target;
    // This slice only persists entities-axis instances (D2 — target NOT NULL).
    // Safe cast: buildBlessModifiers always emits axis='entities' with one id.
    const targetCharacterId =
      target.axis === 'entities' || target.axis === 'attackers-of' ? target.ids[0] : instance.scope.owner;

    return {
      ownerCharacterId: instance.scope.owner as string,
      targetCharacterId: targetCharacterId as string,
      concentrationToken: instance.duration?.concentrationToken ?? null,
      def: instance.def as object,
      scope: instance.scope as object,
      predicate: instance.predicate ? (instance.predicate as object) : null,
      duration: instance.duration ? (instance.duration as object) : null,
      label: instance.label ?? null,
    };
  });

  await db.insert(modifierInstances).values(rows);
}
