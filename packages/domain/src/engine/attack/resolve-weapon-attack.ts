/**
 * resolveWeaponAttack — pure weapon attack resolver for the engine action pipeline.
 *
 * Slice 1 of the action pipeline (engine-action-pipeline SDD).
 * Synchronous, pull-first, read-only. Drives a transient ActionInFlight through
 * DECLARED → TO_HIT → ON_HIT → DAMAGE → ON_DAMAGE_APPLIED → RESOLVED via the
 * existing advancePhase state machine.
 *
 * PHB p.194 — Making an Attack:
 *   "Your attack bonus with a weapon is: Ability Modifier + Proficiency Bonus (if proficient)"
 *
 * Design ref: sdd/engine-action-pipeline/design — ADR-1 through ADR-7.
 *
 * CRITICAL ADR-3: weapon proficiency bonus is folded into `base` — it is NOT
 * passed as the 6th arg to resolveStat (that arg is the ProficiencyMod/skill channel).
 * base = abilityMod + (isProficient ? pb : 0) + magicBonus
 *
 * CRITICAL ADR-7: resolveRollMode takes (mods: ModifierInstance[], ctx), NOT
 * (stat, ctx, registry). Caller must registry.query({...}) first, then pass results.
 */
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { ModifierRegistry } from '../registry/types.js';
import type { Resolved, Source } from '../provenance.js';
import type { ActionInFlight } from '../pipeline/phases.js';
import type { DiceExpr } from '../types.js';
import type { RollModeResult } from '../resolve/roll-mode.js';
import { advancePhase } from '../pipeline/state-machine.js';
import { resolveStat } from '../resolve/stat.js';
import { resolveRollMode } from '../resolve/roll-mode.js';
import { applyStacking } from '../stacking/apply.js';
import { selectAttackAbility } from '../../character/weapon/attack-bonus.js';

// ── Input / Output types ──────────────────────────────────────────────────────

/**
 * All inputs required by resolveWeaponAttack (ADR-2: pre-built, IO-free).
 *
 * The use-case layer is responsible for loading character/sheet/weapon/registry
 * and resolving isProficient before calling this function.
 */
export interface WeaponAttackInput {
  /** The attacking entity's ID (used as origin for provenance). */
  self: EntityId;
  /** Full evaluation context (weaponInUse, target, attacker, encounterRound, currentAction). */
  ctx: EvaluationContext;
  /** Modifier registry built from character modifiers + persisted instances. */
  registry: ModifierRegistry;
  /** Attacker's STR ability modifier (floor((score - 10) / 2)). */
  strMod: number;
  /** Attacker's DEX ability modifier. */
  dexMod: number;
  /** Attacker's proficiency bonus from class level (PHB p.15). */
  proficiencyBonus: number;
  /**
   * Whether the attacker is proficient with this weapon — resolved by the
   * use-case via isWeaponProficient(sheet.proficiencies.weapons, weapon).
   * PHB p.146-149.
   */
  isProficient: boolean;
  /** Weapon stats needed for the attack computation. */
  weapon: {
    kind: 'melee' | 'ranged';
    /** PHB property strings. Key codes: 'F' (finesse), 'T' (thrown), 'finesse', 'thrown'. */
    properties: string[];
    /** +0 for non-magic weapons; integer bonus for identified magic weapons. */
    magicBonus: number;
    /** Weapon damage dice expression (e.g. '1d8', '2d6'). Return-only — not rolled. */
    damageDice: DiceExpr;
    /** Damage type (e.g. 'slashing', 'piercing', 'bludgeoning'). */
    damageType: string;
  };
}

/**
 * Result of resolveWeaponAttack (ADR-6: damage is structured, NOT rolled).
 *
 * toHit carries the native base (ability + proficiency + magic) plus any
 * registry delta mods (Bless +1d4, etc.) with full provenance.
 *
 * damage returns the structured expression — no dice are rolled here.
 * The caller (UI / DM tool) performs the roll.
 */
export interface WeaponAttackResult {
  /** The transient ActionInFlight after driving DECLARED → RESOLVED. */
  action: ActionInFlight;
  /** Attack-roll total with breakdown (ability, proficiency, magic, delta mods). */
  toHit: Resolved<number>;
  /** Structured damage expression — NOT a rolled value (ADR-6). */
  damage: {
    dice: DiceExpr;
    flatMods: Source[];
    breakdown: Source[];
  };
  /** Roll mode resolved from active advantage/disadvantage mods (PHB p.173). */
  rollMode: RollModeResult;
}

// ── resolveWeaponAttack ───────────────────────────────────────────────────────

/**
 * Resolves a weapon attack synchronously, driving a transient ActionInFlight
 * through all five phases: DECLARED → TO_HIT → ON_HIT → DAMAGE → ON_DAMAGE_APPLIED → RESOLVED.
 *
 * Pure — no IO, no DB, no RNG. Returns a complete WeaponAttackResult with
 * full provenance breakdown.
 *
 * @param input - Pre-built attack input (ability mods, proficiency, weapon, registry, ctx).
 * @returns WeaponAttackResult — phase RESOLVED, toHit with breakdown, damage expression, rollMode.
 */
export function resolveWeaponAttack(input: WeaponAttackInput): WeaponAttackResult {
  const { self, ctx, registry, strMod, dexMod, proficiencyBonus, isProficient, weapon } = input;
  const selfRef = ctx.self;

  // ── Phase sweep: DECLARED → TO_HIT ───────────────────────────────────────────
  // Build a transient ActionInFlight starting at DECLARED.
  // (ctx.currentAction may already carry a DECLARED action from the use-case layer;
  //  for testability we always construct fresh here — the use-case provides its ID.)
  let actionResult = advancePhase(
    { id: 'transient-attack', type: 'attack', phase: 'DECLARED' },
    'advance',
  );
  if (!actionResult.ok) throw new Error(`[resolveWeaponAttack] Phase advance failed: DECLARED→TO_HIT`);
  let action = actionResult.action;

  // ── TO_HIT: compute attack-roll base + resolve stat ───────────────────────────
  //
  // ADR-4: ability selection via extracted selectAttackAbility (PHB p.194/p.147).
  // ADR-3 CRITICAL: weapon pb is part of `base` — NOT the 6th resolveStat arg.
  //   base = abilityMod + (isProficient ? pb : 0) + magicBonus
  //   6th arg of resolveStat drives ProficiencyMod (skill/save channel) — leave undefined.
  const abilityMod = selectAttackAbility(strMod, dexMod, weapon.kind, weapon.properties);
  const profBonus = isProficient ? proficiencyBonus : 0;
  const base = abilityMod + profBonus + weapon.magicBonus;

  // Build explicit breakdown sources for the base components:
  //   1. ability source (the ability modifier selected above)
  //   2. proficiency source (only when isProficient — zero is omitted for clarity)
  //   3. magic source (only when magicBonus > 0)
  //
  // These are prepended as 'base' type sources so the UI can distinguish them
  // from registry delta mods (Bless, etc.) which resolveStat appends.
  const baseSources: Source[] = [
    {
      label: 'ability',
      amount: abilityMod,
      type: 'untyped',
      origin: selfRef,
    },
  ];
  if (isProficient) {
    baseSources.push({
      label: 'proficiency',
      amount: proficiencyBonus,
      type: 'untyped',
      origin: selfRef,
    });
  }
  if (weapon.magicBonus !== 0) {
    baseSources.push({
      label: 'magic',
      amount: weapon.magicBonus,
      type: 'item',
      origin: selfRef,
    });
  }

  // resolveStat drives the 5-step resolution algorithm:
  //   1. Gather — queries registry at trigger='always', stat='attack-roll'
  //   2. Filter predicates (inside registry.query)
  //   3. Substitution pass (ReplaceMod — none expected for attack)
  //   4. Stack NumMod instances on top of base (Bless +1d4, etc.)
  //   5. Assemble provenance breakdown
  //
  // ADR-3: NO 6th arg (proficiencyBonus) — weapon pb is already in `base`.
  // The 6th arg is the ProficiencyMod channel (skills/saves); misusing it here
  // would double-count pb for a proficient weapon.
  const resolvedStat = resolveStat(self, 'attack-roll', base, ctx, registry);

  // Merge our explicit base sources with resolveStat's breakdown.
  // resolveStat starts its breakdown with the raw `base` numeric source; we
  // replace it with our split sources (ability, proficiency, magic) to give
  // the UI fine-grained provenance.
  const [statBase, ...statDeltas] = resolvedStat.breakdown;
  void statBase; // discard the single base source — replaced by baseSources
  const toHit: Resolved<number> = {
    value: resolvedStat.value,
    breakdown: [...baseSources, ...statDeltas],
  };

  // ── ADR-7: Gather on-attack-roll mods then resolve roll mode ─────────────────
  // CRITICAL: resolveRollMode takes (mods: ModifierInstance[], ctx) — NOT registry.
  // Must query FIRST, then pass results.
  const rollModeMods = registry.query({
    trigger: 'on-attack-roll',
    self,
    ctx,
  });
  const rollMode = resolveRollMode(rollModeMods, ctx);

  // ── enrichedCtx: copy of ctx with resolvedRollMode threaded in (Option A1) ────
  // Build AFTER rollMode resolution — rollMode.mode is always 'advantage'|'disadvantage'|'normal'
  // (never undefined), so a plain spread is exactOptionalPropertyTypes-safe.
  // Used ONLY for the ON_HIT query so conditional on-hit predicates (e.g. Sneak Attack
  // hasRollMode gate) can see the resolved roll mode.
  // The input `ctx` is NOT mutated. REQ-SA-ROLLMODE-CTX-01.
  // PHB p.96 — Sneak Attack advantage branch; PHB p.173 — advantage/disadvantage.
  const enrichedCtx: EvaluationContext = { ...ctx, resolvedRollMode: rollMode.mode };

  // ── Phase sweep: TO_HIT → ON_HIT ─────────────────────────────────────────────
  actionResult = advancePhase(action, 'advance');
  if (!actionResult.ok) throw new Error('[resolveWeaponAttack] Phase advance failed: TO_HIT→ON_HIT');
  action = actionResult.action;

  // ── ON_HIT: gather on-hit damage riders (PHB p.196 — damage on a hit) ────────
  //
  // ON_HIT channel: on-hit mods are invisible to resolveStat('damage')'s 'always'
  // query — double-count is structurally impossible (query.ts:59). PHB p.196.
  //
  // ADR-4 (design): filter to def.stat==='damage' explicitly before applyStacking —
  // query.ts does NOT filter by stat; only trigger+axis. Mirrors stat.ts:128-135.
  // This is the stat-filter gate: an on-hit NumMod with a different stat (e.g.
  // 'attack-roll') must NOT leak into damage.breakdown.
  //
  // enrichedCtx (not ctx) — carries resolvedRollMode so conditional predicates
  // (e.g. Sneak Attack hasRollMode gate) can evaluate correctly. REQ-SA-ROLLMODE-CTX-01.1.
  const onHitInstances = registry.query({ stat: 'damage', trigger: 'on-hit', self, ctx: enrichedCtx });
  // Explicit stat filter — critical correctness guard (design ADR stat-filter):
  const onHitDamageInstances = onHitInstances.filter(
    (inst) => inst.def.kind === 'num' && inst.def.stat === 'damage',
  );
  // Reuse applyStacking for identical provenance/DiceExpr handling as resolveStat.
  // Base=0; drop the synthetic base Source (amount=0) — mirrors bless pattern.
  const [_onHitBase, ...onHitSources] = applyStacking(onHitDamageInstances, 0, selfRef).breakdown;
  void _onHitBase;

  // ── Phase sweep: ON_HIT → DAMAGE ─────────────────────────────────────────────
  actionResult = advancePhase(action, 'advance');
  if (!actionResult.ok) throw new Error('[resolveWeaponAttack] Phase advance failed: ON_HIT→DAMAGE');
  action = actionResult.action;

  // ── DAMAGE phase: assemble structured expression (ADR-6 — NOT rolled) ────────
  // damage.flatMods = [ability Source] + registry 'damage' stat NumMod Sources.
  // No dice are rolled; caller (UI / DM tool) performs the roll.
  const damageFlatMods: Source[] = [
    {
      label: 'ability',
      amount: abilityMod,
      type: 'untyped',
      origin: selfRef,
    },
  ];

  // Gather 'damage' stat NumMod deltas from registry via trigger:'always'
  // (e.g. Hex, Sneak Attack in future slices). On-hit mods are INVISIBLE here
  // because their trigger is 'on-hit', not 'always' (query.ts:59 guard).
  const damageStatResult = resolveStat(self, 'damage', 0, ctx, registry);
  // damageStatResult.breakdown: first entry is base=0 (discard), rest are delta mods.
  const [_damageBase, ...damageDeltas] = damageStatResult.breakdown;
  void _damageBase;

  // Fold breakdown: ability-mod + on-hit riders + always-trigger damage deltas.
  // On-hit Sources carry DiceExpr amounts (e.g. '1d6') — not rolled (ADR-6).
  const damageBreakdown: Source[] = [...damageFlatMods, ...onHitSources, ...damageDeltas];
  const damage = {
    dice: weapon.damageDice,
    flatMods: damageFlatMods,
    breakdown: damageBreakdown,
  };

  // ── Phase sweep: DAMAGE → ON_DAMAGE_APPLIED ───────────────────────────────────
  actionResult = advancePhase(action, 'advance');
  if (!actionResult.ok) throw new Error('[resolveWeaponAttack] Phase advance failed: DAMAGE→ON_DAMAGE_APPLIED');
  action = actionResult.action;

  // ── Phase sweep: ON_DAMAGE_APPLIED → RESOLVED ─────────────────────────────────
  actionResult = advancePhase(action, 'advance');
  if (!actionResult.ok) throw new Error('[resolveWeaponAttack] Phase advance failed: ON_DAMAGE_APPLIED→RESOLVED');
  action = actionResult.action;

  return { action, toHit, damage, rollMode };
}
