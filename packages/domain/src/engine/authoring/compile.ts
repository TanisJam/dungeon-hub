/**
 * compileRule — YAML RuleDoc to ModifierInstance factory.
 *
 * Design ref: sdd/authoring-dsl/design — Decision 2 (compileRule architecture).
 *
 * PURE FUNCTION: accepts a validated RuleDoc, returns a CompiledRule with a
 * `build(params)` factory. No IO, no filesystem access.
 *
 * Compilation strategy:
 *   1. Template substitution: walk every string field in each emit, replacing
 *      `{name}` slots with the corresponding param value (scalar substitution).
 *   2. Array fan-out: when a param is `string[]` and the emit references it in
 *      `scope.target.ids`, the emit is cloned once per array element.
 *      The fan-out slot in `idTemplate` is expected to use the singular form
 *      (e.g. `{targetId}` for `targetIds`).
 *   3. Multi-emit: multiple entries in `emits[]` produce independent instances.
 *      Each goes through substitution + potential fan-out independently.
 *   4. Escape hatch: if `rule.escape` is present, `build()` THROWS
 *      `EscapeHatchNotImplemented`. The compiler NEVER fabricates handler behavior.
 *
 * ID generation:
 *   If `emit.idTemplate` is present, it is used (after substitution).
 *   Default fallback: `{ruleId}-{emitIndex}-{owner}`.
 *
 * Predicate AST passthrough:
 *   The parsed predicate is already a valid engine `Predicate` (same JSON shape).
 *   String-valued fields in the predicate run through scalar substitution.
 *   The engine evaluatePredicate consumes it unchanged.
 */
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EntityId, Trigger, Modifier } from '../types.js';
import type { Predicate } from '../predicate/types.js';
import type { DurationSpec } from '../types.js';
import type { RuleDoc, RuleParams, CompiledRule } from './types.js';

// ── EscapeHatchNotImplemented ─────────────────────────────────────────────────

/**
 * Thrown by CompiledRule.build() for escape-hatch rules.
 *
 * The compiler emits a stub + flag (`escaped: true, handlerRef`) for imperative
 * rules — it NEVER fabricates handler behavior. The caller is responsible for
 * wiring the `handlerRef` to a registered TS function before calling `build()`.
 */
export class EscapeHatchNotImplemented extends Error {
  constructor(handlerRef: string) {
    super(
      `EscapeHatchNotImplemented: rule requires handler '${handlerRef}'. ` +
        `Wire the handler before calling build().`,
    );
    this.name = 'EscapeHatchNotImplemented';
  }
}

// ── Template substitution ─────────────────────────────────────────────────────

/**
 * Substitutes all `{name}` slots in a string with values from params.
 * Scalar substitution only — array params are not interpolated here;
 * they are handled by the fan-out logic in buildEmitInstances.
 */
function substituteString(template: string, params: RuleParams): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) return `{${key}}`; // leave unresolved slots as-is
    if (Array.isArray(value)) return `{${key}}`; // arrays: leave for fan-out
    return String(value);
  });
}

/**
 * Deep-walk a plain object/array/string and substitute all string values.
 * Skips arrays (they are handled separately for fan-out).
 */
function substituteDeep(value: unknown, params: RuleParams): unknown {
  if (typeof value === 'string') {
    return substituteString(value, params);
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteDeep(item, params));
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = substituteDeep(v, params);
    }
    return result;
  }
  return value;
}

// ── Fan-out detection ─────────────────────────────────────────────────────────

/**
 * Detect if an emit declares a fan-out (EntityId[] param referenced in
 * scope.target.ids as a template string like `{targetIds}`).
 *
 * Returns the param key and its values if fan-out is needed, or null.
 */
function detectFanOut(
  emit: RuleDoc['emits'][number],
  params: RuleParams,
): { key: string; values: string[] } | null {
  const target = emit.scope.target;
  if (target.axis !== 'entities' && target.axis !== 'attackers-of') return null;

  const ids = target.ids;
  if (typeof ids !== 'string') return null;

  // ids is a template like '{targetIds}' — extract the key
  const match = ids.match(/^\{([^}]+)\}$/);
  if (!match) return null;

  const key = match[1]!;
  const value = params[key];
  if (!Array.isArray(value)) return null;

  return { key, values: value as string[] };
}

// ── Instance builder ──────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

function eid(s: string): EntityId {
  return s as EntityId;
}

/**
 * Build ModifierInstance entries for a single emit, applying fan-out if needed.
 */
function buildEmitInstances(
  ruleId: string,
  emitIndex: number,
  emit: RuleDoc['emits'][number],
  params: RuleParams,
): ModifierInstance[] {
  const fanOut = detectFanOut(emit, params);

  if (fanOut !== null) {
    // Fan-out: one instance per array element
    return fanOut.values.map((targetValue) => {
      // Build a per-element param set where the singular form is substituted
      // e.g. targetIds=['ally-A','ally-B'] → per-iteration: targetId='ally-A'
      const singularKey = fanOut.key.replace(/s$/, ''); // 'targetIds' → 'targetId'
      const perElementParams: RuleParams = {
        ...params,
        [singularKey]: targetValue,
        [fanOut.key]: targetValue, // also substitute the plural key with current element
      };

      return buildSingleInstance(ruleId, emitIndex, emit, perElementParams, targetValue);
    });
  }

  return [buildSingleInstance(ruleId, emitIndex, emit, params, undefined)];
}

/**
 * Build one ModifierInstance from an emit and resolved params.
 * `targetElement` is set during fan-out to substitute target-specific ID parts.
 */
function buildSingleInstance(
  ruleId: string,
  emitIndex: number,
  emit: RuleDoc['emits'][number],
  params: RuleParams,
  targetElement: string | undefined,
): ModifierInstance {
  // Augment params with ruleId for template substitution
  const fullParams: RuleParams = { ...params, ruleId };

  // Determine the instance ID
  const idTemplate =
    emit.idTemplate ?? `{ruleId}-${emitIndex}-{owner}`;
  const instanceId = substituteString(idTemplate, fullParams);

  // Substitute the owner
  const owner = substituteString(emit.scope.owner, fullParams);

  // Build the target scope with substituted values
  let targetScope: ModifierInstance['scope']['target'];
  const rawTarget = emit.scope.target;
  if (rawTarget.axis === 'self') {
    targetScope = { axis: 'self' };
  } else {
    // For entities/attackers-of: during fan-out, use the single resolved element
    let resolvedIds: EntityId[];
    if (targetElement !== undefined) {
      resolvedIds = [eid(targetElement)];
    } else {
      const rawIds = rawTarget.ids;
      if (typeof rawIds === 'string') {
        resolvedIds = [eid(substituteString(rawIds, fullParams))];
      } else {
        resolvedIds = rawIds.map((id) => eid(substituteString(id, fullParams)));
      }
    }
    if (rawTarget.axis === 'entities') {
      targetScope = { axis: 'entities', ids: resolvedIds };
    } else {
      targetScope = { axis: 'attackers-of', ids: resolvedIds };
    }
  }

  // Substitute the modifier def (deep walk, string fields only)
  const def = substituteDeep(emit.def, fullParams) as Modifier;

  // Build the instance
  const instance: ModifierInstance = {
    id: iid(instanceId),
    def,
    scope: {
      owner: eid(owner),
      target: targetScope,
      trigger: emit.scope.trigger as Trigger,
    },
  };

  // Optional fields
  if (emit.label !== undefined) {
    instance.label = substituteString(emit.label, fullParams);
  }
  if (emit.predicate !== undefined) {
    instance.predicate = substituteDeep(emit.predicate, fullParams) as Predicate;
  }
  if (emit.duration !== undefined) {
    instance.duration = substituteDeep(emit.duration, fullParams) as DurationSpec;
  }

  return instance;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compile a validated RuleDoc into a ModifierInstance factory.
 *
 * PURE: no IO. Accepts a RuleDoc (output of parseRule), returns a CompiledRule.
 *
 * For escape-hatch rules (`rule.escape` present), the returned `build()` THROWS
 * `EscapeHatchNotImplemented` — the compiler NEVER fabricates handler behavior.
 *
 * @param rule — validated RuleDoc (output of parseRule)
 * @returns CompiledRule — { build, escaped, handlerRef? }
 */
export function compileRule(rule: RuleDoc): CompiledRule {
  const { id: ruleId, escape } = rule;

  // Escape-hatch rule: return stub + flag
  if (escape !== undefined) {
    const handlerRef = escape.handler;
    return {
      escaped: true,
      handlerRef,
      build: (_params: RuleParams): ModifierInstance[] => {
        throw new EscapeHatchNotImplemented(handlerRef);
      },
    };
  }

  // Normal rule: build factory
  return {
    escaped: false,
    build: (params: RuleParams): ModifierInstance[] => {
      const instances: ModifierInstance[] = [];
      for (let i = 0; i < rule.emits.length; i++) {
        const emit = rule.emits[i]!;
        const emitInstances = buildEmitInstances(ruleId, i, emit, params);
        instances.push(...emitInstances);
      }
      return instances;
    },
  };
}
