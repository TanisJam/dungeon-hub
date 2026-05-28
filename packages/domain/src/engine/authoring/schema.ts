/**
 * Zod schemas for the Authoring DSL (Slice 2).
 *
 * Design ref: sdd/authoring-dsl/design — Decision 1 (RuleDoc shape), Decision 5 (module layout).
 *
 * This file provides:
 *   - ProficiencyModSchema — 10th modifier kind Zod schema (§REQ-PROF-01).
 *   - ModifierDefSchema — discriminatedUnion over ALL 10 kinds (§3.4 closed guard).
 *   - StatKeySchema — valid stat keys (abilities, skills, saves, etc.).
 *   - PredicateSchema — recursive Zod (z.lazy) for the Predicate AST.
 *   - RuleEmitSchema — one emit declaration in a rule.
 *   - RuleDocSchema — the top-level authored rule shape with required `source`.
 *
 * `ProficiencyMod.ref` is a FREE string (z.string().min(1)) — homebrew skills and
 * custom DM-defined entries must pass without list validation.
 * // TODO #513: runtime ref validation against DB catalog is deferred.
 *
 * `source` is REQUIRED (§1.1 PHB-wins): a rule without a PHB/DMG/MM citation
 * cannot be authored. The schema rejects absent or empty source strings.
 */
import { z } from 'zod';

// ── ProficiencyModSchema (10th kind) ──────────────────────────────────────────

export const ProficiencyModSchema = z.object({
  kind: z.literal('proficiency'),
  domain: z.enum(['skill', 'save', 'tool', 'language', 'weapon', 'armor']),
  ref: z.string().min(1), // TODO #513: future DB-injected resolver for ref validation
  level: z.enum(['proficient', 'expertise']).optional(),
});

export type ProficiencyModSchemaInput = z.input<typeof ProficiencyModSchema>;
export type ProficiencyModSchemaOutput = z.output<typeof ProficiencyModSchema>;

// ── StatKeySchema ─────────────────────────────────────────────────────────────

/**
 * Valid stat keys for the resolution engine.
 * Mirrors the TypeScript `StatKey` union from engine/types.ts.
 *
 * `saving-throw` — flat key (all-saves effects like Bless, Cloak).
 * `saving-throw.${ability}` — per-ability key (Resilient (Con) → 'saving-throw.con').
 * `skill.${string}` — any skill key (open string for homebrew skills).
 */
const abilityLiterals = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);

const flatStatLiterals = z.enum([
  'ac',
  'hp',
  'speed',
  'initiative',
  'attack-roll',
  'saving-throw',
  'damage',
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
]);

// per-ability saving throw: 'saving-throw.con', 'saving-throw.dex', etc.
const perAbilitySavePattern = z
  .string()
  .regex(/^saving-throw\.(str|dex|con|int|wis|cha)$/);

// skill.anything: 'skill.athletics', 'skill.lore-of-the-ancients', etc.
const skillPattern = z.string().regex(/^skill\..+$/);

export const StatKeySchema = z.union([
  flatStatLiterals,
  perAbilitySavePattern,
  skillPattern,
]);

// ── WorldQuerySchema ──────────────────────────────────────────────────────────

const WorldQuerySchema: z.ZodType<unknown> = z.union([
  z.object({ kind: z.literal('attackerWithin'), ft: z.number() }),
  z.object({ kind: z.literal('weaponKind'), is: z.enum(['melee', 'ranged']) }),
  z.object({
    kind: z.literal('hasCondition'),
    entity: z.enum(['self', 'attacker', 'target']),
    condition: z.string(),
  }),
  z.object({
    kind: z.literal('canSee'),
    entity: z.literal('self'),
    of: z.literal('caster'),
  }),
  z.object({ kind: z.literal('spellLevelAtMost'), n: z.number() }),
]);

// ── PredicateSchema (recursive via z.lazy) ─────────────────────────────────

/**
 * Recursive Zod schema for the Predicate AST.
 * z.lazy is required for the and/or/not recursive cases.
 */
export const PredicateSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('and'), nodes: z.array(PredicateSchema) }),
    z.object({ op: z.literal('or'), nodes: z.array(PredicateSchema) }),
    z.object({ op: z.literal('not'), node: PredicateSchema }),
    z.object({ op: z.literal('query'), q: WorldQuerySchema }),
  ]),
);

// ── ModifierDefSchema — discriminatedUnion over 10 kinds (§3.4 closed guard) ─

export const ModifierDefSchema = z.discriminatedUnion('kind', [
  // 1. num
  z.object({
    kind: z.literal('num'),
    op: z.literal('add'),
    value: z.union([z.number(), z.string()]),
    stat: StatKeySchema,
    category: z.enum(['untyped', 'item', 'status', 'circumstance']),
  }),
  // 2. advantage
  z.object({
    kind: z.literal('advantage'),
    mode: z.enum(['grant', 'impose']),
    rollType: z.enum(['attack', 'save', 'check', 'damage', 'initiative']),
  }),
  // 3. choice
  z.object({
    kind: z.literal('choice'),
    selects: z.enum(['targets', 'stat']),
    count: z.number(),
    from: z
      .object({
        kind: z.enum(['spell', 'condition', 'item', 'feature']),
        id: z.string(),
      })
      .optional(),
  }),
  // 4. concentration
  z.object({
    kind: z.literal('concentration'),
    emits: z.array(z.string()),
  }),
  // 5. reaction
  z.object({
    kind: z.literal('reaction'),
    on: z.enum(['cast', 'attacked', 'damaged']),
    predicate: PredicateSchema,
    effect: z.object({
      kind: z.literal('counter'),
      autoIfSlotGe: z.number(),
    }),
  }),
  // 6. usage
  z.object({
    kind: z.literal('usage'),
    pool: z.literal('tiered'),
    resetOn: z.enum(['short-rest', 'long-rest', 'dawn', 'turn-start']),
  }),
  // 7. replace
  z.object({
    kind: z.literal('replace'),
    stat: StatKeySchema,
    with: z.union([
      z.object({ from: z.literal('beast-stat'), beastId: z.string() }),
      z.object({ from: z.literal('fixed'), value: z.number() }),
    ]),
    retain: z.array(StatKeySchema).optional(),
    policy: z.literal('max-self-beast').optional(),
  }),
  // 8. gmRuling
  z.object({
    kind: z.literal('gmRuling'),
    prompt: z.string(),
    mechanical: z.array(z.unknown()).optional(),
  }),
  // 9. noop
  z.object({
    kind: z.literal('noop'),
  }),
  // 10. proficiency
  ProficiencyModSchema,
]);

// ── TargetScopeSchema ─────────────────────────────────────────────────────────

export const TargetScopeSchema = z.union([
  z.object({ axis: z.literal('self') }),
  z.object({ axis: z.literal('entities'), ids: z.union([z.array(z.string()), z.string()]) }),
  z.object({ axis: z.literal('attackers-of'), ids: z.union([z.array(z.string()), z.string()]) }),
]);

// ── DurationSpecSchema ────────────────────────────────────────────────────────

export const DurationSpecSchema = z.object({
  unit: z.enum(['round', 'minute', 'hour']),
  amount: z.number(),
  endsOn: z
    .array(z.enum(['concentration-ends', 'hp-reaches-zero', 'duration-expires', 'turn-ends']))
    .optional(),
  concentrationToken: z.string().optional(),
});

// ── RuleEmitSchema ────────────────────────────────────────────────────────────

export const RuleEmitSchema = z.object({
  def: ModifierDefSchema,
  scope: z.object({
    owner: z.string(),
    target: TargetScopeSchema,
    trigger: z.enum([
      'always',
      'on-attack-roll',
      'on-save',
      'on-cast',
      'on-attacked',
      'on-damage',
    ]),
  }),
  predicate: PredicateSchema.optional(),
  duration: DurationSpecSchema.optional(),
  label: z.string().optional(),
  idTemplate: z.string().optional(),
});

// ── RuleParamSchema ───────────────────────────────────────────────────────────

export const RuleParamSchema = z.object({
  name: z.string(),
  type: z.enum(['EntityId', 'EntityId[]', 'string', 'number']),
});

// ── TestCaseSchema ────────────────────────────────────────────────────────────

export const TestCaseSchema = z.object({
  description: z.string().optional(),
  params: z.record(z.unknown()),
  expectedInstances: z.array(z.unknown()),
  expectedResolution: z
    .object({
      stat: StatKeySchema,
      base: z.number(),
      expectedValue: z.union([z.number(), z.string()]),
      expectedBreakdownSource: z.string(),
    })
    .optional(),
});

// ── EscapeSchema ──────────────────────────────────────────────────────────────

export const EscapeSchema = z.object({
  handler: z.string(),
});

// ── RuleDocSchema ─────────────────────────────────────────────────────────────

/**
 * The top-level authored rule schema.
 *
 * `source` REQUIRED (§1.1 PHB-wins): validates that every authored rule cites
 * a PHB/DMG/MM page. Empty string is rejected — z.string().min(1) enforces this.
 *
 * `emits` contains one or more RuleEmit entries. The `def.kind` discriminatedUnion
 * IS the §3.4 closed-kind guard — a hallucinated kind fails Zod here.
 *
 * `escape` (optional): if present, the compiler emits a stub + flag for the
 * imperative handler. No fabricated behavior.
 */
export const RuleDocSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1), // REQUIRED — §1.1 PHB-wins; rejects absent/empty
  ruleText: z.string().optional(),
  params: z.array(RuleParamSchema).default([]),
  emits: z.array(RuleEmitSchema),
  escape: EscapeSchema.optional(),
  testCases: z.array(TestCaseSchema).default([]),
});

export type RuleDocSchemaInput = z.input<typeof RuleDocSchema>;
export type RuleDocSchemaOutput = z.output<typeof RuleDocSchema>;
