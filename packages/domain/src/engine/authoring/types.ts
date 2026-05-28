/**
 * Types for the Authoring DSL compiler (Slice 2).
 *
 * Design ref: sdd/authoring-dsl/design — Decision 2 (compileRule architecture),
 *   Decision 4 (generateTestStub), Decision 5 (module layout).
 *
 * `RuleDoc` — the typed output of parseRule (the authored rule, validated).
 * `RuleEmit` — one emit declaration in a rule.
 * `RuleParams` — runtime parameter bag for slot substitution.
 * `CompiledRule` — the result of compileRule: a factory function + escape metadata.
 */
import type { RuleDocSchemaOutput } from './schema.js';
import type { ModifierInstance } from '../registry/types.js';

// ── Re-export RuleDoc as the canonical typed form ─────────────────────────────

/** The validated, typed authored rule. Output of parseRule. */
export type RuleDoc = RuleDocSchemaOutput;

/** One emit declaration within a RuleDoc. */
export type RuleEmit = RuleDoc['emits'][number];

// ── RuleParams ────────────────────────────────────────────────────────────────

/**
 * Runtime parameter bag for slot substitution.
 *
 * Values can be:
 *   - `string` — scalar EntityId or string param
 *   - `string[]` — EntityId[] param (triggers fan-out on the emit)
 *   - `number` — numeric param
 */
export type RuleParams = Record<string, string | string[] | number>;

// ── CompiledRule ──────────────────────────────────────────────────────────────

/**
 * The output of `compileRule`.
 *
 * `build(params)` — factory function. For normal rules, returns ModifierInstance[].
 *   For escape-hatch rules, THROWS `EscapeHatchNotImplemented` — the compiler
 *   NEVER fabricates handler behavior.
 *
 * `escaped` — true if the rule has an `escape` declaration. The caller is
 *   responsible for wiring the handlerRef to a registered TS function.
 *
 * `handlerRef` — the handler reference string (e.g. 'counterspell.fire').
 *   Present only when `escaped` is true.
 */
export interface CompiledRule {
  build: (params: RuleParams) => ModifierInstance[];
  escaped: boolean;
  handlerRef?: string;
}
