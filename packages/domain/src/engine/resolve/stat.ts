/**
 * resolveStat — pull-first stat resolution with provenance.
 *
 * Implements the 5-step algorithm from design §"Resolution algorithm":
 *   1. Gather   — registry.query across both axes for the target stat.
 *   2. Filter   — predicate filter is applied inside registry.query already.
 *   3. Substitute — FIRST: ReplaceMod instances override the base value before
 *                  numeric mods are applied (Wild Shape). Order matters.
 *   4. Stack    — applyStacking on remaining NumMod instances (type-level).
 *   5. Assemble — return { value, breakdown: Source[] } with provenance.
 *
 * // REQ-RESOLVE-01: pull-first provenance (c.2)
 * Design ref: sdd/resolution-engine/design — "Resolution algorithm".
 *
 * Notes on substitution:
 *   - ReplaceMod with retain[] lists stats whose base value comes from self.
 *   - If the queried stat is in retain[], the substitute is skipped and the
 *     passed-in base value is used.
 *   - policy='max-self-beast' takes max(selfBase, substituteValue).
 *   - gmRuling kind: not handled in resolveStat (routes to form-switching subsystem).
 *   - Multiple ReplaceMods on the same stat: last-wins (undefined behaviour in 5e;
 *     only one form-switch should be active at a time).
 */
import type { EntityId, StatKey, ReplaceMod } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { ModifierRegistry } from '../registry/types.js';
import type { Resolved, Source } from '../provenance.js';
import { applyStacking } from '../stacking/apply.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves a numeric stat value with full provenance.
 *
 * @param self     - ID of the entity whose stat is being resolved.
 * @param stat     - The stat key being resolved (e.g. 'str', 'attack-roll').
 * @param base     - The unmodified base value of the stat.
 * @param ctx      - The evaluation context (encounter state, attacker, weapon, etc.).
 * @param registry - The modifier registry to query.
 * @returns `Resolved<number>` with final value and ordered provenance breakdown.
 */
export function resolveStat(
  self: EntityId,
  stat: StatKey,
  base: number,
  ctx: EvaluationContext,
  registry: ModifierRegistry,
): Resolved<number> {
  const selfRef = ctx.self;

  // ── Step 1: Gather ─────────────────────────────────────────────────────────
  // registry.query already performs the bidirectional gather AND predicate filter.
  // Trigger 'always' gathers all modifiers regardless of trigger type.
  // For stat-specific resolution we use trigger='always' and filter by stat below.
  const allInstances = registry.query({
    stat,
    trigger: 'always',
    self,
    ctx,
  });

  // ── Step 2: Predicate filter — already applied inside registry.query ───────
  // (No additional filtering needed here.)

  // ── Step 3: Substitution pass FIRST (ReplaceMod before numerics) ──────────
  // Wild Shape: physical stats are replaced by beast values.
  // If no ReplaceMod applies, resolvedBase remains the passed-in base.
  let resolvedBase = base;
  const substituteSource: Source | undefined = (() => {
    const replaceMods = allInstances.filter(
      (inst): inst is typeof inst & { def: ReplaceMod } => inst.def.kind === 'replace',
    );

    // Find a ReplaceMod targeting this stat
    const applicableMod = replaceMods.find((inst) => inst.def.stat === stat);
    if (applicableMod === undefined) return undefined;

    const replaceDef = applicableMod.def;

    // If stat is in the retention list, skip substitution
    if (replaceDef.retain !== undefined && replaceDef.retain.includes(stat)) {
      return undefined;
    }

    // Resolve the substitute value
    let substituteValue: number;
    if (replaceDef.with.from === 'fixed') {
      substituteValue = replaceDef.with.value;
    } else {
      // 'beast-stat': resolver not available at this layer — skip silently.
      // In practice, the use-case layer resolves the beast stat and passes a
      // fixed ValueSource. This path is a fallback only.
      return undefined;
    }

    // Apply policy
    if (replaceDef.policy === 'max-self-beast') {
      resolvedBase = Math.max(base, substituteValue);
    } else {
      resolvedBase = substituteValue;
    }

    return {
      label: 'Wild Shape (beast form)',
      amount: substituteValue,
      type: 'ReplaceMod',
      modifierId: applicableMod.id,
      origin: selfRef,
    } satisfies Source;
  })();

  // ── Step 4: Type-level stacking on NumMod instances ────────────────────────
  const numInstances = allInstances.filter((inst) => inst.def.kind === 'num');
  const stackedResult = applyStacking(numInstances, resolvedBase, selfRef);

  // ── Step 5: Assemble provenance ────────────────────────────────────────────
  // If there was a substitution, inject its source after the base source.
  if (substituteSource !== undefined) {
    // Replace the base source's amount with the substituted value for clarity,
    // then append the ReplaceMod source.
    const [baseSource, ...modSources] = stackedResult.breakdown;
    return {
      value: stackedResult.value,
      breakdown: [
        baseSource!,
        substituteSource,
        ...modSources,
      ],
    };
  }

  return stackedResult;
}
