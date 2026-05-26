import type { AbilityKey } from '../stats/types.js';
import type { AppliedClass } from '../class/types.js';

export type MulticlassValidationIssue =
  | { code: 'MULTICLASS_DISABLED_BY_CAMPAIGN' }
  | { code: 'CLASS_NOT_FOUND'; class: { slug: string; source: string } }
  | { code: 'CLASS_DISABLED'; class: { slug: string; source: string } }
  | {
      code: 'CLASS_ALREADY_PRESENT';
      class: { slug: string; source: string };
      hint: string;
    }
  | {
      code: 'PREREQ_NOT_MET';
      class: { slug: string; source: string };
      missing: Array<{ ability: AbilityKey; got: number; needed: number }>;
    }
  | {
      code: 'EXISTING_CLASS_PREREQ_BROKEN';
      class: { slug: string };
      missing: Array<{ ability: AbilityKey; got: number; needed: number }>;
      hint: string;
    }
  | {
      code: 'NO_BASE_STATS';
      hint: string;
    }
  | { code: 'SUBCLASS_NOT_FOUND'; subclass: { slug: string; source: string } }
  | { code: 'SUBCLASS_DISABLED'; subclass: { slug: string; source: string } }
  | {
      code: 'SUBCLASS_DOES_NOT_BELONG_TO_CLASS';
      classSlug: string;
      classSource: string;
      subclassClassSlug: string;
      subclassClassSource: string;
    }
  | {
      code: 'SUBCLASS_REQUIRED';
      classSlug: string;
      level: number;
      unlockLevel: number;
    }
  | {
      code: 'SUBCLASS_NOT_YET_AVAILABLE';
      classSlug: string;
      level: number;
      unlockLevel: number;
    }
  | {
      code: 'MULTICLASS_SKILL_REQUIRED';
      classSlug: string;
      expectedCount: number;
      gotCount: number;
      pool: readonly string[] | 'any';
    }
  | { code: 'MULTICLASS_SKILL_NOT_ALLOWED'; classSlug: string; skill: string; pool: readonly string[] }
  | { code: 'MULTICLASS_SKILL_DUPLICATE'; skill: string }
  | {
      code: 'MULTICLASS_PROFS_TABLE_MISSING';
      classSlug: string;
      hint: string;
    }
  | {
      code: 'MULTICLASS_TOOL_REQUIRED';
      classSlug: string;
      expectedCount: number;
      gotCount: number;
      slots: Array<{ kind: string; count: number }>;
    };

export type MulticlassValidationResult =
  | { ok: true; appliedClass: AppliedClass }
  | { ok: false; issues: MulticlassValidationIssue[] };
