/**
 * applyActiveEffect — catalog-driven modifier pipeline use-case.
 *
 * Looks up an effect by slug in modifier_definitions, validates its RuleDoc
 * at write time (parseRule — write-strict, NEVER tolerates bad rows), compiles
 * it, builds modifier instances, and persists them. If the rule requires
 * concentration (RuleDoc has an emit with def.kind='concentration'), calls
 * the shared concentration service to enforce one-at-a-time (PHB p.203).
 *
 * REQ-AE-01: Happy path — persists 2 × len(targetIds) instances for Bless.
 * REQ-AE-02: Unknown slug → { ok:false, error:'EFFECT_NOT_FOUND' }.
 * REQ-AE-03: Malformed ruleDoc → { ok:false, error:'INVALID_EFFECT_DEF', issues }.
 * REQ-BC-01: Consumed by castBless (delegation point — drops buildBlessModifiers import).
 * REQ-CONC-02, REQ-CONC-04: one-at-a-time via startConcentration (concentration spells only).
 *
 * PHB 219 — Bless (write path); PHB 203–204 — Concentration.
 *
 * Design ref: sdd/engine-active-effects/design #1153.
 * Design ref: sdd/engine-concentration-authority/design #1430 — ADR-4.
 * §11 write-strict: a bad catalog row at write time → LOUD 400, no DB write.
 * The read path (loadModifierDefinitions, WHERE kind='item') is separate and UNTOUCHED.
 */

import { eq } from 'drizzle-orm';
import { parseRule, compileRule } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { modifierDefinitions } from '../../infra/db/schema.js';
import { applyModifierInstances } from './apply-modifier-instances.js';
import { startConcentration } from '../engine/concentration-service.js';

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
 *   5. If rule emits a 'concentration' modifier → startConcentration (PHB p.203 one-at-a-time)
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

  // Step 5 — REQ-CONC-02/04: if this rule requires concentration, enforce one-at-a-time.
  // Detect via RuleDoc: a rule requires concentration if ANY emit's duration has endsOn
  // containing 'concentration-ends'. This is the authoritative marker in the Authoring DSL.
  // (The 'concentration' def.kind is a separate control-modifier — not present in Bless.)
  // Non-concentration rules skip this entirely, leaving the caster's active concentration intact.
  // PHB p.203: "only spells that require concentration trigger the drop."
  const requiresConcentration = parseResult.rule.emits.some(
    (e) => e.duration?.endsOn?.includes('concentration-ends') ?? false,
  );
  if (requiresConcentration) {
    await startConcentration({
      characterId: casterId,
      newConcentration: {
        store: 'modifier_instances',
        spellName: effectSlug,
        token: concentrationToken,
      },
    });
  }

  return { ok: true };
}
