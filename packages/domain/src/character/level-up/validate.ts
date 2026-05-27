import type { RulesProfile } from '../../rules-profile/types.js';
import type { ClassCompendiumData, SubclassCompendiumData, AppliedClass } from '../class/types.js';
import type { AppliedAsi } from '../race/types.js';
import type { AppliedFeat, FeatCompendiumData } from '../feat/types.js';
import type { CharacterSnapshot } from '../sheet/types.js';
import type { MulticlassValidationIssue } from '../multiclass/types.js';
import { canReachLevel } from './xp-table.js';
import { hpDeltaForLevelUp } from './hp-delta.js';
import { isAsiLevelFor } from './asi-levels.js';
import { validateAsiDelta } from './asi-delta-validator.js';
import { computeSubclassUnlockLevel } from '../class/validate.js';
import { validateMulticlassAddition } from '../multiclass/validate.js';
import { computeEffectiveScores } from '../multiclass/effective-scores.js';
import { collectClassFeaturesAtLevel } from '../class/features.js';

// ---- Types -----------------------------------------------------------------

export interface ClassRef {
  slug: string;
  source: string;
}

export type HpInput = { method: 'average' } | { method: 'roll' };

export type AsiFeatInput =
  | { kind: 'asi'; deltas: Partial<Record<string, number>> }
  | { kind: 'feat'; slug: string; source: string };

export type LevelUpBody =
  | {
      kind: 'same-class';
      class: ClassRef;
      subclass?: ClassRef | null;
      hp: HpInput;
      asiFeat?: AsiFeatInput;
      classFeaturePicks?: unknown;
      spellPicks?: unknown;
    }
  | {
      kind: 'new-class';
      class: ClassRef;
      subclass?: ClassRef | null;
      skillChoices?: string[];
      toolChoices?: string[];
      hp: HpInput;
      spellPicks?: unknown;
    };

export type LevelUpIssue =
  | { code: 'LEVELUP_INSUFFICIENT_XP'; current: number; required: number; missing: number; targetLevel: number }
  | { code: 'LEVELUP_STATUS_INVALID'; status: string; allowed: ['active'] }
  | { code: 'LEVELUP_TOTAL_LEVEL_CAP_EXCEEDED'; currentTotal: number; attemptedTotal: number; cap: 14 }
  | { code: 'LEVELUP_CLASS_NOT_OWNED'; class: ClassRef }
  | { code: 'SUBCLASS_REQUIRED_AT_LEVEL'; classSlug: string; targetLevel: number; unlockLevel: number }
  | { code: 'LEVELUP_ASIFEAT_REQUIRED'; classSlug: string; targetLevel: number }
  | { code: 'ASI_DELTA_INVALID'; reason: string }
  | { code: 'FEAT_NOT_FOUND'; feat: { slug: string; source: string } }
  | MulticlassValidationIssue;

export interface LevelUpMutations {
  classesNext: AppliedClass[];
  hpDelta: number;
  rollUsed: number | null;
  asiPushed?: AppliedAsi | undefined;
  featPushed?: AppliedFeat | undefined;
  hpRollEntry?: { classSlug: string; level: number; roll: number } | undefined;
  featuresUnlocked: Array<{ classSlug: string; level: number; featureSlug: string; featureName: string }>;
}

export interface LevelUpSummary {
  classSlug: string;
  fromClassLevel: number;
  toClassLevel: number;
  totalLevelAfter: number;
  hpDelta: number;
  rollUsed: number | null;
  asiFeatApplied?: 'asi' | 'feat' | undefined;
}

export type LevelUpResult =
  | { ok: true; mutations: LevelUpMutations; summary: LevelUpSummary }
  | { ok: false; issues: LevelUpIssue[] };

export interface LevelUpInput {
  rulesProfile: RulesProfile;
  /** Character data snapshot — includes status, xp, classes, stats, etc. */
  character: CharacterSnapshot & { xp: number; status: string };
  body: LevelUpBody;
  /** Class compendium data for the class being leveled. */
  classData: ClassCompendiumData;
  /** Subclass compendium data (same-class: existing subclass or newly provided; new-class: newly provided). */
  subclassData?: SubclassCompendiumData | null;
  /** Server-rolled value for HP if body.hp.method === 'roll'. Never trust client-provided rolls. */
  serverRoll?: number | null;
  /**
   * Feat compendium data — required when body.asiFeat?.kind === 'feat'.
   * If asiFeat.kind='feat' and this is absent, returns FEAT_NOT_FOUND.
   * The route handler is responsible for loading this via loadFeatData before calling validateLevelUp.
   */
  featData?: FeatCompendiumData | null;
}

const LEVEL_CAP = 14;
const DEFAULT_SUBCLASS_UNLOCK = 3;

// ---- Orchestrator ----------------------------------------------------------

/**
 * Validates a level-up request, producing either a mutation plan or issues.
 *
 * Validation order (spec): status → xp → total level cap → per-class branch →
 * HP delta → features unlocked.
 *
 * REQ-CLU-XP-GATE, REQ-CLU-STATUS-GATE, REQ-CLU-LEVEL-CAP, REQ-CLU-SAME-CLASS-MUST-OWN,
 * REQ-CLU-SUBCLASS-AT-UNLOCK, REQ-CLU-ASI-AT-LEVEL, REQ-CLU-ASI-DELTA-CONSTRAINT,
 * REQ-CLU-HP-DELTA-ATOMIC, REQ-CLU-HP-MINIMUM-1.
 */
export function validateLevelUp(input: LevelUpInput): LevelUpResult {
  const issues: LevelUpIssue[] = [];
  const { rulesProfile, character, body, classData, subclassData, serverRoll } = input;

  const existingClasses = character.classes ?? [];
  const currentTotal = existingClasses.reduce((sum, c) => sum + c.level, 0);
  const targetTotal = currentTotal + 1;

  // ---- 1) Status gate (REQ-CLU-STATUS-GATE) --------------------------------
  if (character.status !== 'active') {
    issues.push({
      code: 'LEVELUP_STATUS_INVALID',
      status: character.status,
      allowed: ['active'],
    });
    return { ok: false, issues };
  }

  // ---- 2) XP gate (REQ-CLU-XP-GATE) ----------------------------------------
  const xpCheck = canReachLevel(character.xp, targetTotal);
  if (xpCheck !== null) {
    issues.push({
      code: 'LEVELUP_INSUFFICIENT_XP',
      current: xpCheck.current,
      required: xpCheck.required,
      missing: xpCheck.missing,
      targetLevel: targetTotal,
    });
    return { ok: false, issues };
  }

  // ---- 3) Total level cap (REQ-CLU-LEVEL-CAP) -------------------------------
  if (targetTotal > LEVEL_CAP) {
    issues.push({
      code: 'LEVELUP_TOTAL_LEVEL_CAP_EXCEEDED',
      currentTotal,
      attemptedTotal: targetTotal,
      cap: LEVEL_CAP,
    });
    return { ok: false, issues };
  }

  // ---- 4) Branch dispatch ---------------------------------------------------
  if (body.kind === 'same-class') {
    return validateSameClassBranch(input, existingClasses, currentTotal, targetTotal, issues);
  } else {
    return validateNewClassBranch(input, existingClasses, currentTotal, targetTotal, issues);
  }
}

// ---- Same-class branch -----------------------------------------------------

function validateSameClassBranch(
  input: LevelUpInput,
  existingClasses: AppliedClass[],
  currentTotal: number,
  targetTotal: number,
  issues: LevelUpIssue[],
): LevelUpResult {
  const { rulesProfile, character, body, classData, subclassData, serverRoll, featData } = input;
  if (body.kind !== 'same-class') return { ok: false, issues };

  // ---- 4a) Must own the class ----------------------------------------------
  const ownedClass = existingClasses.find(
    (c) => c.slug === body.class.slug && c.source === body.class.source,
  );
  if (!ownedClass) {
    issues.push({ code: 'LEVELUP_CLASS_NOT_OWNED', class: body.class });
    return { ok: false, issues };
  }

  const fromClassLevel = ownedClass.level;
  const toClassLevel = fromClassLevel + 1;

  // ---- 4b) Subclass required at unlock level -------------------------------
  const unlockLevel = computeSubclassUnlockLevel(classData) ?? DEFAULT_SUBCLASS_UNLOCK;
  const alreadyHasSubclass = ownedClass.subclass !== null;
  const providingSubclass = body.subclass != null;

  if (toClassLevel >= unlockLevel && !alreadyHasSubclass && !providingSubclass) {
    issues.push({
      code: 'SUBCLASS_REQUIRED_AT_LEVEL',
      classSlug: body.class.slug,
      targetLevel: toClassLevel,
      unlockLevel,
    });
    return { ok: false, issues };
  }

  // ---- 4c) ASI/feat required at ASI level ----------------------------------
  const isAsiLevel = isAsiLevelFor(classData, toClassLevel);
  if (isAsiLevel && !body.asiFeat) {
    issues.push({
      code: 'LEVELUP_ASIFEAT_REQUIRED',
      classSlug: body.class.slug,
      targetLevel: toClassLevel,
    });
    return { ok: false, issues };
  }

  // ---- 4d) Validate ASI delta if provided ---------------------------------
  let asiPushed: AppliedAsi | undefined;
  let featPushed: AppliedFeat | undefined;

  if (body.asiFeat?.kind === 'asi') {
    const effectiveScores = computeEffectiveScores(
      character.baseStats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      character.asisApplied ?? [],
    );
    const deltaResult = validateAsiDelta(body.asiFeat.deltas, effectiveScores);
    if (!deltaResult.ok) {
      issues.push({ code: 'ASI_DELTA_INVALID', reason: deltaResult.reason });
      return { ok: false, issues };
    }
    // Build asiPushed entries — one per ability in the delta
    // For simplicity, we push the first/largest delta as a single AppliedAsi entry.
    // Full multi-ability ASI persistence is handled at the API layer (stores array in levelUpAsis).
    // Here we return the primary ASI entry.
    const entries = Object.entries(body.asiFeat.deltas).filter(([, v]) => (v as number) > 0);
    if (entries.length > 0) {
      // Push the first entry as the main ASI (API stores full deltas separately)
      const [firstAbility, firstBonus] = entries[0]!;
      asiPushed = {
        ability: firstAbility as import('../stats/types.js').AbilityKey,
        bonus: firstBonus as number,
        source: 'levelup',
      };
    }
  }

  // ---- 4e) Validate feat if provided (REQ-CLU-FEAT-VALID) -----------------
  // When asiFeat.kind='feat', the route must supply featData after calling loadFeatData.
  // If featData is absent, the feat slug was not found in the compendium → FEAT_NOT_FOUND.
  if (body.asiFeat?.kind === 'feat') {
    if (!featData) {
      issues.push({ code: 'FEAT_NOT_FOUND', feat: { slug: body.asiFeat.slug, source: body.asiFeat.source } });
      return { ok: false, issues };
    }
    // Build the minimal AppliedFeat from the compendium data.
    // Feat ASI choices (ability grants) are handled by the route/wizard layer;
    // at this point we record the feat with empty asisApplied (no ASI granted by the feat itself
    // is resolved here — the caller handles any asiChoice before persisting).
    featPushed = {
      slug: featData.slug,
      source: featData.source,
      asisApplied: [],
    };
  }

  // ---- 5) HP delta ---------------------------------------------------------
  const conMod = computeConMod(character);
  const hpResult = hpDeltaForLevelUp({
    hitDie: ownedClass.hitDie,
    conMod,
    method: body.hp.method,
    roll: serverRoll ?? null,
  });

  if (!hpResult.ok) {
    // Surface HP validation issues as generic — shouldn't normally happen if server rolls correctly
    return {
      ok: false,
      issues: [{ code: 'ASI_DELTA_INVALID', reason: `HP error: ${hpResult.issues[0]?.code}` }],
    };
  }

  // ---- 6) Build mutations --------------------------------------------------
  const classesNext: AppliedClass[] = existingClasses.map((c) => {
    if (c.slug === body.class.slug && c.source === body.class.source) {
      return {
        ...c,
        level: toClassLevel,
        subclass: body.subclass ?? c.subclass,
      };
    }
    return c;
  });

  const featuresUnlocked = collectClassFeaturesAtLevel(classData, toClassLevel);

  const mutations: LevelUpMutations = {
    classesNext,
    hpDelta: hpResult.delta,
    rollUsed: hpResult.rollUsed,
    featuresUnlocked,
  };

  if (asiPushed !== undefined) mutations.asiPushed = asiPushed;
  if (featPushed !== undefined) mutations.featPushed = featPushed;

  if (hpResult.rollUsed !== null) {
    mutations.hpRollEntry = {
      classSlug: body.class.slug,
      level: toClassLevel,
      roll: hpResult.rollUsed,
    };
  }

  const summary: LevelUpSummary = {
    classSlug: body.class.slug,
    fromClassLevel,
    toClassLevel,
    totalLevelAfter: targetTotal,
    hpDelta: hpResult.delta,
    rollUsed: hpResult.rollUsed,
  };

  if (body.asiFeat) {
    summary.asiFeatApplied = body.asiFeat.kind;
  }

  return { ok: true, mutations, summary };
}

// ---- New-class branch ------------------------------------------------------

function validateNewClassBranch(
  input: LevelUpInput,
  existingClasses: AppliedClass[],
  currentTotal: number,
  targetTotal: number,
  issues: LevelUpIssue[],
): LevelUpResult {
  const { rulesProfile, character, body, classData, subclassData, serverRoll } = input;
  if (body.kind !== 'new-class') return { ok: false, issues };

  // ---- Delegate to validateMulticlassAddition (handles multiclass disabled, prereqs, etc.)
  const mcInput: Parameters<typeof validateMulticlassAddition>[0] = {
    rulesProfile,
    baseStats: character.baseStats ?? null,
    existingClasses: existingClasses.map((c) => ({ slug: c.slug, source: c.source })),
    newClassData: classData,
  };
  if (character.asisApplied !== undefined) mcInput.asisApplied = character.asisApplied;
  if (subclassData !== undefined) mcInput.newSubclassData = subclassData;
  if (body.skillChoices !== undefined) mcInput.skillChoices = body.skillChoices;
  if (body.toolChoices !== undefined) mcInput.toolChoices = body.toolChoices;
  const mcResult = validateMulticlassAddition(mcInput);

  if (!mcResult.ok) {
    // Propagate multiclass validation issues
    for (const issue of mcResult.issues) {
      issues.push(issue as LevelUpIssue);
    }
    return { ok: false, issues };
  }

  // ---- HP delta ------------------------------------------------------------
  const conMod = computeConMod(character);
  const hpResult = hpDeltaForLevelUp({
    hitDie: mcResult.appliedClass.hitDie,
    conMod,
    method: body.hp.method,
    roll: serverRoll ?? null,
  });

  if (!hpResult.ok) {
    return {
      ok: false,
      issues: [{ code: 'ASI_DELTA_INVALID', reason: `HP error: ${hpResult.issues[0]?.code}` }],
    };
  }

  // ---- Build mutations -----------------------------------------------------
  const classesNext: AppliedClass[] = [...existingClasses, mcResult.appliedClass];

  // New-class always starts at level 1 — collect L1 features from the new class's data.
  const featuresUnlockedNewClass = collectClassFeaturesAtLevel(classData, 1);

  const mutations: LevelUpMutations = {
    classesNext,
    hpDelta: hpResult.delta,
    rollUsed: hpResult.rollUsed,
    featuresUnlocked: featuresUnlockedNewClass,
  };

  if (hpResult.rollUsed !== null) {
    mutations.hpRollEntry = {
      classSlug: body.class.slug,
      level: 1,
      roll: hpResult.rollUsed,
    };
  }

  const summary: LevelUpSummary = {
    classSlug: body.class.slug,
    fromClassLevel: 0,
    toClassLevel: 1,
    totalLevelAfter: targetTotal,
    hpDelta: hpResult.delta,
    rollUsed: hpResult.rollUsed,
  };

  return { ok: true, mutations, summary };
}

// ---- Helpers ---------------------------------------------------------------

function computeConMod(character: CharacterSnapshot): number {
  const baseStats = character.baseStats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const asisApplied = character.asisApplied ?? [];
  const effective = computeEffectiveScores(baseStats, asisApplied);
  return Math.floor((effective.con - 10) / 2);
}
