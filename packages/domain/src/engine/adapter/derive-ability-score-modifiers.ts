/**
 * derive-ability-score-modifiers — ASI arrays → ModifierInstance[] adapter.
 *
 * Pure domain helper. No IO, no registry access.
 *
 * Projects the three stored ASI arrays (asisApplied, levelUpAsis, feats) into
 * ModifierInstance[] ready for registry.register(). One NumMod per non-zero entry.
 *
 * All three sources are additive — no keep-highest between them.
 * PHB p.13: "Each ability also has a modifier, derived from the score..."
 * PHB p.165: ASIs from racial, subrace, level-up, and feats all stack.
 * StackCategory 'untyped' → all-stack strategy (correct for ASIs in v1).
 *
 * Label format per parity ledger §4b guardrail:
 *   "Racial ASI +{bonus} {ABILITY}"    — race source
 *   "Subrace ASI +{bonus} {ABILITY}"   — subrace source
 *   "Level-up ASI +{bonus} {ABILITY}"  — levelup source
 *   "Feat ({featSlug}) +{bonus} {ABILITY}" — feat source
 *
 * // PHB names resolved at presentation layer from compendium — see parity ledger §4b.
 * // Race/subrace human names (e.g. "Mountain Dwarf") are NOT hardcoded here because
 * // AppliedAsi carries no name — only ability, bonus, and source. Enrichment from
 * // snapshot.race.slug / snapshot.subrace.slug is deferred to the breakdown UI.
 *
 * REQ-AS-ADAPTER-01..05
 */

import type { AppliedAsi } from '../../character/race/types.js';
import type { AppliedFeat } from '../../character/feat/types.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Narrow snapshot slice consumed by the adapter.
 * NOT the full CharacterSnapshot — keeps the adapter decoupled from sheet types.
 *
 * Design §2: inputs are the three stored ASI arrays + charId.
 */
export interface AbilityScoreModifierInput {
  /** Race/subrace ASIs (source: 'race' | 'subrace'). PHB p.18-20, p.39. */
  asisApplied?: AppliedAsi[];
  /** Level-up ASIs (source: 'levelup'). PHB p.165. */
  levelUpAsis?: AppliedAsi[];
  /** Feats with ASI grants (source per feat slug). PHB p.168 Resilient etc. */
  feats?: AppliedFeat[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives a flat list of ModifierInstances from the character's three ASI sources.
 *
 * All sources project uniformly to NumMod{ kind:'num', op:'add', category:'untyped' }.
 * Entries with bonus === 0 are silently skipped (keeps breakdown clean).
 *
 * @param input  - Narrow snapshot slice: asisApplied + levelUpAsis + feats.
 * @param charId - EntityId of the owning character.
 * @returns Flat array of ModifierInstances ready for registry.register().
 */
export function deriveAbilityScoreModifiers(
  input: AbilityScoreModifierInput,
  charId: EntityId,
): ModifierInstance[] {
  const instances: ModifierInstance[] = [];

  // ── Source A: asisApplied (race / subrace) ───────────────────────────────────
  for (const [i, entry] of (input.asisApplied ?? []).entries()) {
    if (entry.bonus === 0) continue; // skip no-ops

    const sourceLabel = entry.source === 'subrace' ? 'Subrace ASI' : 'Racial ASI';
    // PHB names resolved at presentation layer from compendium — see parity ledger §4b.
    const label = `${sourceLabel} +${entry.bonus} ${entry.ability.toUpperCase()}`;

    instances.push({
      id: `asi-racial-${entry.source}-${entry.ability}-${i}` as ModifierInstanceId,
      def: { kind: 'num', op: 'add', value: entry.bonus, stat: entry.ability, category: 'untyped' },
      scope: { owner: charId, target: { axis: 'self' }, trigger: 'always' },
      label,
    });
  }

  // ── Source B: levelUpAsis (level-up) ────────────────────────────────────────
  for (const [i, entry] of (input.levelUpAsis ?? []).entries()) {
    if (entry.bonus === 0) continue;

    // PHB names resolved at presentation layer from compendium — see parity ledger §4b.
    const label = `Level-up ASI +${entry.bonus} ${entry.ability.toUpperCase()}`;

    instances.push({
      id: `asi-levelup-${entry.ability}-${i}` as ModifierInstanceId,
      def: { kind: 'num', op: 'add', value: entry.bonus, stat: entry.ability, category: 'untyped' },
      scope: { owner: charId, target: { axis: 'self' }, trigger: 'always' },
      label,
    });
  }

  // ── Source C: feats[*].asisApplied ──────────────────────────────────────────
  for (const [fi, feat] of (input.feats ?? []).entries()) {
    for (const [ai, entry] of (feat.asisApplied ?? []).entries()) {
      if (entry.bonus === 0) continue;

      // Feat slug IS available from AppliedFeat — include it in the label.
      // PHB names resolved at presentation layer from compendium — see parity ledger §4b.
      const label = `Feat (${feat.slug}) +${entry.bonus} ${entry.ability.toUpperCase()}`;

      instances.push({
        id: `asi-feat-${feat.slug}-${entry.ability}-${fi}-${ai}` as ModifierInstanceId,
        def: { kind: 'num', op: 'add', value: entry.bonus, stat: entry.ability, category: 'untyped' },
        scope: { owner: charId, target: { axis: 'self' }, trigger: 'always' },
        label,
      });
    }
  }

  return instances;
}
