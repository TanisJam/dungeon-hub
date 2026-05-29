/**
 * applyActiveEffect — catalog-driven modifier pipeline use-case.
 *
 * Looks up an effect by slug in modifier_definitions, validates its RuleDoc
 * at write time (parseRule — write-strict, NEVER tolerates bad rows), compiles
 * it, builds modifier instances, and persists them.
 *
 * REQ-AE-01: Happy path — persists 2 × len(targetIds) instances for Bless.
 * REQ-AE-02: Unknown slug → { ok:false, error:'EFFECT_NOT_FOUND' }.
 * REQ-AE-03: Malformed ruleDoc → { ok:false, error:'INVALID_EFFECT_DEF', issues }.
 * REQ-BC-01: Consumed by castBless (delegation point — drops buildBlessModifiers import).
 *
 * PHB 219 — Bless (write path); PHB 203–204 — Concentration.
 *
 * Design ref: sdd/engine-active-effects/design #1153.
 * §11 write-strict: a bad catalog row at write time → LOUD 400, no DB write.
 * The read path (loadModifierDefinitions, WHERE kind='item') is separate and UNTOUCHED.
 */

import { eq } from 'drizzle-orm';
import { parseRule, compileRule } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { modifierDefinitions } from '../../infra/db/schema.js';
import { applyModifierInstances } from './apply-modifier-instances.js';

// ── Result type ───────────────────────────────────────────────────────────────

export type ApplyActiveEffectResult =
  | { ok: true }
  | { ok: false; error: 'EFFECT_NOT_FOUND' }
  | { ok: false; error: 'INVALID_EFFECT_DEF'; issues: unknown[] };

// ── Use-case ──────────────────────────────────────────────────────────────────

/**
 * Applies a catalog-defined effect by slug to the given targets.
 *
 * Pipeline:
 *   1. SELECT modifier_definitions WHERE slug = effectSlug
 *      → miss  → { ok:false, error:'EFFECT_NOT_FOUND' }
 *   2. parseRule(row.ruleDoc) — write-strict
 *      → !ok   → { ok:false, error:'INVALID_EFFECT_DEF', issues }
 *   3. compileRule(rule).build({ casterId, targetIds, concentrationToken })
 *   4. applyModifierInstances(instances)
 *      → { ok:true }
 *
 * Unexpected DB errors still throw (→ 500 from Fastify).
 */
export async function applyActiveEffect(
  casterId: string,
  effectSlug: string,
  targetIds: string[],
  concentrationToken: string,
  startRound?: number,
): Promise<ApplyActiveEffectResult> {
  // Step 1 — catalog lookup (write-strict path, separate from item loader).
  const rows = await db
    .select()
    .from(modifierDefinitions)
    .where(eq(modifierDefinitions.slug, effectSlug));

  if (rows.length === 0) {
    return { ok: false, error: 'EFFECT_NOT_FOUND' };
  }

  const row = rows[0]!;

  // Step 2 — write-strict parseRule validation.
  const parseResult = parseRule(row.ruleDoc);
  if (!parseResult.ok) {
    return { ok: false, error: 'INVALID_EFFECT_DEF', issues: parseResult.issues };
  }

  // Step 3 — compile and build instances (fan-out per targetIds element).
  const compiled = compileRule(parseResult.rule);
  const instances = compiled.build({ casterId, targetIds, concentrationToken });

  // Step 4 — persist (engine-timeline-duration: pass startRound for round-based expiry).
  await applyModifierInstances(instances, startRound);

  return { ok: true };
}
