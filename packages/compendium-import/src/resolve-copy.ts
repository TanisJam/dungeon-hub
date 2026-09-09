/**
 * Resolves 5etools `_copy` directives — 5etools' `_copyProps` mechanism.
 *
 * Some 5etools rows are stubs that only reference a "base" row via `_copy`
 * instead of carrying their own mechanics. Left unresolved, such a row
 * imports as `{ name, source, _copy: { ... } }` with no `entries` — this
 * module materializes the real content by cloning the base and applying the
 * row's own overrides and `_mod` operations on top of it, exactly as
 * 5etools' web app does at render time.
 *
 * This resolver is category-agnostic: it takes a flat array of raw rows
 * from ONE 5etools category (races, backgrounds, items, ...) and resolves
 * every `_copy` row against the OTHER rows of that same array, recursively
 * (a base can itself be a `_copy`) with cycle detection.
 */

export interface CopyOperation {
  mode: string;
  items?: unknown;
  index?: number;
  replace?: string | { index: number };
  with?: string;
  flags?: string;
}

export interface CopyDirective {
  name: string;
  source: string;
  _mod?: Record<string, CopyOperation | CopyOperation[]>;
  _preserve?: Record<string, boolean>;
}

/**
 * Top-level base props a `_copy` row does NOT inherit from its base, per
 * 5etools `_copyProps` — unless the row's own `_copy._preserve` says
 * otherwise (see step 3 below).
 */
const NON_COPYABLE_BASE_PROPS = [
  'page',
  'srd',
  'basicRules',
  'otherSources',
  'additionalSources',
  'reprintedAs',
  'hasFluff',
  'hasFluffImages',
  '_versions',
  '_copy',
  '_preserve',
];

function rowKey(name: string, source: string): string {
  return `${name}|${source}`;
}

function asItemsArray(items: unknown): unknown[] {
  return Array.isArray(items) ? items : [items];
}

/**
 * Matches 5etools `_copyProps` splice semantics for `insertArr`: a negative
 * index counts from the end, with `-1` meaning "append at the end" —
 * `splice(length + index + 1, 0, ...items)`.
 */
function insertArrIndex(arrLength: number, index: number): number {
  return index < 0 ? arrLength + index + 1 : index;
}

/** `.name` for object items (the common case), the raw value otherwise (e.g. string property codes). */
function itemIdentity(item: unknown): unknown {
  if (item && typeof item === 'object' && 'name' in (item as Record<string, unknown>)) {
    return (item as Record<string, unknown>)['name'];
  }
  return item;
}

function deepReplaceTxt(value: unknown, pattern: RegExp, replacement: string): unknown {
  if (typeof value === 'string') return value.replace(pattern, replacement);
  if (Array.isArray(value)) return value.map((v) => deepReplaceTxt(v, pattern, replacement));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepReplaceTxt(v, pattern, replacement);
    }
    return out;
  }
  return value;
}

function applyOneMod(
  target: Record<string, unknown>,
  targetKey: string,
  op: CopyOperation,
  warnings: string[],
  context: string,
): void {
  const current = target[targetKey];

  switch (op.mode) {
    case 'appendArr': {
      const arr = Array.isArray(current) ? current : [];
      arr.push(...asItemsArray(op.items));
      target[targetKey] = arr;
      break;
    }
    case 'insertArr': {
      const arr = Array.isArray(current) ? current : [];
      const rawIndex = op.index ?? arr.length;
      const idx = insertArrIndex(arr.length, rawIndex);
      const clamped = Math.max(0, Math.min(idx, arr.length));
      arr.splice(clamped, 0, ...asItemsArray(op.items));
      target[targetKey] = arr;
      break;
    }
    case 'appendIfNotExistsArr': {
      const arr = Array.isArray(current) ? current : [];
      for (const item of asItemsArray(op.items)) {
        const id = itemIdentity(item);
        const exists = arr.some((existing) => itemIdentity(existing) === id);
        if (!exists) arr.push(item);
      }
      target[targetKey] = arr;
      break;
    }
    case 'replaceArr': {
      if (!Array.isArray(current)) {
        warnings.push(`${context}: replaceArr on missing/non-array "${targetKey}" — skipped`);
        break;
      }
      let idx = -1;
      if (op.replace != null && typeof op.replace === 'object' && 'index' in op.replace) {
        idx = op.replace.index;
      } else if (typeof op.replace === 'string') {
        idx = current.findIndex((it) => itemIdentity(it) === op.replace);
      }
      if (idx < 0 || idx >= current.length) {
        warnings.push(
          `${context}: replaceArr target "${String(op.replace)}" not found in "${targetKey}" — array left unchanged`,
        );
        break;
      }
      current.splice(idx, 1, ...asItemsArray(op.items));
      break;
    }
    case 'replaceTxt': {
      if (typeof op.replace !== 'string' || typeof op.with !== 'string') {
        warnings.push(`${context}: replaceTxt missing "replace"/"with" on "${targetKey}" — skipped`);
        break;
      }
      const pattern = new RegExp(op.replace, op.flags ?? '');
      target[targetKey] = deepReplaceTxt(current, pattern, op.with);
      break;
    }
    default:
      warnings.push(`${context}: unknown _mod mode "${op.mode}" on "${targetKey}" — skipped`);
  }
}

function applyMods(
  target: Record<string, unknown>,
  modSpec: Record<string, CopyOperation | CopyOperation[]>,
  warnings: string[],
  context: string,
): void {
  for (const [targetKey, opsRaw] of Object.entries(modSpec)) {
    const ops = Array.isArray(opsRaw) ? opsRaw : [opsRaw];
    for (const op of ops) {
      applyOneMod(target, targetKey, op, warnings, context);
    }
  }
}

/**
 * Resolves every `_copy` directive in `rows` against the other rows of the
 * SAME array (bases are looked up by `name|source` within `rows`).
 *
 * - Rows without `_copy` pass through unchanged (same reference).
 * - A row whose base cannot be found (typically because the base lives in a
 *   source excluded upstream, e.g. XPHB/XDMG/XMM/UA*) is returned UNTOUCHED
 *   — `_copy` stays on it — and a warning is pushed. It never throws.
 * - A `_copy` cycle is detected, warned about, and broken so resolution
 *   always terminates.
 *
 * @param rows rows from one 5etools category, already filtered for excluded sources.
 * @param warnings the importer's shared warnings array — mutated in place.
 * @param kind short label used in warning messages (e.g. "race", "background", "item").
 */
export function resolveCopies<T extends { name: string; source: string }>(
  rows: T[],
  warnings: string[],
  kind: string,
): T[] {
  const asRecord = (row: T): Record<string, unknown> => row as unknown as Record<string, unknown>;

  const byKey = new Map<string, T>();
  for (const row of rows) {
    byKey.set(rowKey(row.name, row.source), row);
  }

  // Keyed by row IDENTITY, not by `name|source` — several categories (races)
  // carry legitimate rows with no `name` at all (metadata-only subrace stubs),
  // and a string key would collapse all of them onto the same cache entry.
  // `name|source` is only meaningful (and unique enough) for BASE lookups,
  // handled separately via `byKey` above.
  const resolved = new Map<T, Record<string, unknown>>();
  const resolving = new Set<T>();

  function resolve(row: T): Record<string, unknown> {
    const cached = resolved.get(row);
    if (cached) return cached;

    const rec = asRecord(row);
    const copy = rec['_copy'] as CopyDirective | undefined;
    if (!copy) {
      resolved.set(row, rec);
      return rec;
    }

    if (resolving.has(row)) {
      warnings.push(`${kind} "${row.name}" (${row.source}): _copy cycle detected — row left untouched`);
      resolved.set(row, rec);
      return rec;
    }

    const baseKey = rowKey(copy.name, copy.source);
    const baseRow = byKey.get(baseKey);
    if (!baseRow) {
      warnings.push(
        `${kind} "${row.name}" (${row.source}): _copy base "${copy.name}|${copy.source}" not found ` +
          `(likely an excluded source) — row left untouched`,
      );
      resolved.set(row, rec);
      return rec;
    }

    resolving.add(row);
    let baseResolved: Record<string, unknown>;
    try {
      baseResolved = resolve(baseRow);
    } finally {
      resolving.delete(row);
    }

    const context = `${kind} "${row.name}" (${row.source})`;
    try {
      const merged = structuredClone(baseResolved);
      for (const prop of NON_COPYABLE_BASE_PROPS) {
        delete merged[prop];
      }

      if (copy._preserve) {
        for (const [prop, shouldPreserve] of Object.entries(copy._preserve)) {
          if (!shouldPreserve) continue;
          if (prop in baseResolved) {
            merged[prop] = structuredClone(baseResolved[prop]);
          }
        }
      }

      for (const [k, v] of Object.entries(rec)) {
        if (k === '_copy') continue;
        merged[k] = structuredClone(v);
      }

      if (copy._mod) {
        applyMods(merged, copy._mod, warnings, context);
      }

      merged['_copiedFrom'] = `${copy.name}|${copy.source}`;
      delete merged['_copy'];

      resolved.set(row, merged);
      return merged;
    } catch (err) {
      warnings.push(
        `${context}: _copy resolution failed unexpectedly (${(err as Error).message}) — row left untouched`,
      );
      resolved.set(row, rec);
      return rec;
    }
  }

  return rows.map((row) => resolve(row) as unknown as T);
}
