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
import { isProficiencyMod } from '../types.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves a numeric stat value with full provenance.
 *
 * @param self              - ID of the entity whose stat is being resolved.
 * @param stat              - The stat key being resolved (e.g. 'str', 'attack-roll').
 * @param base              - The unmodified base value of the stat.
 * @param ctx               - The evaluation context (encounter state, attacker, weapon, etc.).
 * @param registry          - The modifier registry to query.
 * @param proficiencyBonus  - Optional injected proficiency bonus for the entity.
 *                            When undefined, the proficiency gather branch is a no-op —
 *                            ALL existing 5-arg callers are unaffected.
 *
 * // TODO #513: `proficiencyBonus` is interim-injected. When the DB-injected proficiency
 *   resolver lands, this param becomes a resolver fn or is replaced by a context field.
 *
 * @returns `Resolved<number>` with final value and ordered provenance breakdown.
 */
export function resolveStat(
  self: EntityId,
  stat: StatKey,
  base: number,
  ctx: EvaluationContext,
  registry: ModifierRegistry,
  proficiencyBonus?: number,
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
  // REQ-RESOLVE-01: numeric mods apply only to their target stat (cross-stat isolation).
  // Filter by both kind AND stat-match. Stat-match rules:
  //   - Exact match: inst.def.stat === stat (covers all ordinary cases).
  //   - All-saves rule: when resolving a per-ability save ('saving-throw.<ability>'),
  //     also include flat 'saving-throw' mods (Bless +1d4, Cloak +1 — PHB/DMG all-saves effects).
  //     This is the ONLY cross-key inclusion; it is one-directional (flat → per-ability, never reverse).
  const numInstances = allInstances.filter((inst) => {
    if (inst.def.kind !== 'num') return false;
    const modStat = inst.def.stat;
    if (modStat === stat) return true;
    // All-saves rule: flat 'saving-throw' mod applies to any per-ability save resolution.
    if (modStat === 'saving-throw' && stat.startsWith('saving-throw.')) return true;
    return false;
  });
  const stackedResult = applyStacking(numInstances, resolvedBase, selfRef);

  // ── Step 4b: Proficiency gather branch ────────────────────────────────────
  // ProficiencyMod instances are gathered and projected as untyped Source entries.
  // This branch is a no-op when proficiencyBonus is undefined (all existing callers
  // pass 5 args, leaving proficiencyBonus === undefined — backward-safe).
  //
  // Matching logic: a ProficiencyMod { domain:'skill', ref:'athletics' } contributes
  // when the queried stat is 'skill.athletics'. For saves and other domains, matching
  // is by exact stat key (e.g. 'saving-throw' for domain:'save'). The current
  // implementation matches domain:'skill' → stat must start with 'skill.' and
  // ref must match the trailing part. Other domains match by stat key equality.
  //
  // // TODO #513: when the DB-injected proficiency resolver lands, the `ref` matching
  //   against the stat key moves to the resolver, which will also validate homebrew refs.
  const proficiencySources: Source[] = [];
  if (proficiencyBonus !== undefined) {
    const profInstances = allInstances.filter((inst) => isProficiencyMod(inst.def));
    for (const inst of profInstances) {
      if (!isProficiencyMod(inst.def)) continue;
      const def = inst.def;

      // Match this proficiency modifier to the queried stat
      let matches = false;
      if (def.domain === 'skill') {
        // skill.athletics matches domain:'skill', ref:'athletics'
        matches = stat === `skill.${def.ref}`;
      } else if (def.domain === 'save') {
        // PHB 179: saving throws are per-ability. PHB 168: Resilient grants proficiency in
        // ONE ability's saves only. A proficiency{domain:'save', ref:'con'} must match ONLY
        // 'saving-throw.con', not 'saving-throw.dex' or any other save key.
        // Mirror the skill branch: ref must match the ability suffix after the dot.
        matches = stat === `saving-throw.${def.ref}`;
      } else {
        // tool/language/weapon/armor — direct stat key match
        matches = stat === def.ref;
      }

      if (!matches) continue;

      const level = def.level ?? 'proficient';
      const amount = level === 'expertise' ? 2 * proficiencyBonus : proficiencyBonus;

      proficiencySources.push({
        label: inst.label ?? inst.id,
        amount,
        type: 'untyped',
        modifierId: inst.id,
        origin: selfRef,
      } satisfies Source);
    }
  }

  // ── Step 5: Assemble provenance ────────────────────────────────────────────
  // Incorporate proficiency sources into value + breakdown.
  const proficiencyTotal = proficiencySources.reduce(
    (sum, s) => sum + (typeof s.amount === 'number' ? s.amount : 0),
    0,
  );

  // If there was a substitution, inject its source after the base source.
  if (substituteSource !== undefined) {
    // Replace the base source's amount with the substituted value for clarity,
    // then append the ReplaceMod source.
    const [baseSource, ...modSources] = stackedResult.breakdown;
    return {
      value: stackedResult.value + proficiencyTotal,
      breakdown: [
        baseSource!,
        substituteSource,
        ...modSources,
        ...proficiencySources,
      ],
    };
  }

  if (proficiencySources.length > 0) {
    return {
      value: stackedResult.value + proficiencyTotal,
      breakdown: [...stackedResult.breakdown, ...proficiencySources],
    };
  }

  return stackedResult;
}
