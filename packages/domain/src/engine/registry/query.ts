/**
 * In-memory implementation of ModifierRegistry — bidirectional gather + predicate filter.
 *
 * query(input, ctx) gathers all applicable modifier instances across two axes:
 *   (a) self-scoped: instances whose scope.target.axis = 'self' AND scope.owner = input.self.
 *   (b) entities-scoped: instances whose scope.target.axis = 'entities' AND
 *       input.self is in scope.target.ids.
 *   (c) attackers-of-scoped: instances living on ctx.target whose axis = 'attackers-of'
 *       and ctx.attacker is in their ids (Prone outgoing case — bidirectional axis).
 *
 * Then predicate-filters each gathered instance via evaluatePredicate.
 * Instances with a predicate that throws (missing ctx field) are excluded silently.
 *
 * REQ-REGISTRY-01: bidirectional (owner, target, trigger) actor/target axis.
 * Design ref: sdd/resolution-engine/design — "Registry — the central finding".
 */
import { evaluatePredicate } from '../predicate/evaluate.js';
import type { ModifierInstance, ModifierInstanceId, ModifierRegistry, RegistryQueryInput } from './types.js';
import type { EntityId } from '../types.js';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a new in-memory ModifierRegistry.
 *
 * Registrations are keyed by instance ID. The registry is a plain in-memory
 * Map — not persisted. For round-trip persistence the caller serializes
 * `Array.from(registry entries)` and re-registers on load.
 */
export function createInMemoryRegistry(): ModifierRegistry {
  const store = new Map<ModifierInstanceId, ModifierInstance>();

  return {
    register(instance: ModifierInstance): ModifierInstanceId {
      store.set(instance.id, instance);
      return instance.id;
    },

    remove(id: ModifierInstanceId): void {
      store.delete(id);
    },

    removeByConcentrationToken(token: string): void {
      for (const [id, instance] of store) {
        // concentrationToken is now a formal field on DurationSpec (Phase 7 fix).
        if (instance.duration?.concentrationToken === token) {
          store.delete(id);
        }
      }
    },

    query(input: RegistryQueryInput): ModifierInstance[] {
      const { self, ctx, trigger } = input;
      const results: ModifierInstance[] = [];

      for (const instance of store.values()) {
        // ── Trigger filter ──────────────────────────────────────────────────
        // 'always' matches any query; otherwise exact match required.
        if (instance.scope.trigger !== 'always' && instance.scope.trigger !== trigger) {
          continue;
        }

        // ── Bidirectional axis gather ───────────────────────────────────────
        const target = instance.scope.target;
        let included = false;

        if (target.axis === 'self') {
          // (a) Self-scoped: modifier affects ONLY the owner.
          included = instance.scope.owner === self;

        } else if (target.axis === 'entities') {
          // (b) Entities-scoped (cross-entity, e.g. Bless).
          // Include if `self` is in the target list.
          included = target.ids.includes(self as EntityId);

        } else if (target.axis === 'attackers-of') {
          // (c) Attackers-of-scoped (outgoing/defensive, e.g. Prone).
          // THE bidirectional axis: this modifier lives on a TARGET entity and
          // applies to whoever attacks it.
          //
          // Include when:
          //   - ctx.attacker is present (we ARE resolving an attack)
          //   - ctx.attacker.id (the querying attacker) is in target.ids
          //     (the ids list identifies WHICH entities' attackers are affected)
          //
          // Note: target.ids here stores the OWNER's entity IDs — i.e. the
          // entities being attacked — not the attacker IDs. The attacker matches
          // if the owner is in the ids list (it is their Prone condition).
          // In practice: Prone on B → owner=B, target.ids=[B] →
          // any attacker querying while ctx.target.id === B gets it.
          const attackerId = ctx.attacker?.id;
          if (attackerId !== undefined) {
            // The modifier applies to attackers of the entities listed in ids.
            // We check if ctx.target.id is in the ids list (the attacked entity).
            const targetId = ctx.target?.id;
            if (targetId !== undefined && target.ids.includes(targetId)) {
              included = true;
            }
          }
        }

        if (!included) continue;

        // ── Predicate filter ────────────────────────────────────────────────
        if (instance.predicate !== undefined) {
          try {
            const passes = evaluatePredicate(instance.predicate, ctx);
            if (!passes) continue;
          } catch {
            // Missing ctx field — instance cannot be evaluated; exclude it.
            continue;
          }
        }

        results.push(instance);
      }

      return results;
    },
  };
}
