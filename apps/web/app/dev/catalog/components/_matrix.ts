import type { ComponentEntry, VariantCombination } from './_registry-types';

/**
 * buildMatrix — pure helper that expands a ComponentEntry into its variant grid.
 *
 * Three modes:
 *  - no variantAxes → single combo from schema defaults + fixedProps
 *  - matrixMode: 'cartesian' (default) → full cartesian product of all axes
 *  - matrixMode: 'list' → one combo per explicitCombos[i], merged over defaults + fixedProps
 */
export function buildMatrix(entry: ComponentEntry): VariantCombination[] {
  const schemaDefaults = extractSchemaDefaults(entry);
  const base = { ...schemaDefaults, ...(entry.fixedProps ?? {}) };

  // ── list mode ─────────────────────────────────────────────────────────────
  if (entry.matrixMode === 'list') {
    const combos = entry.explicitCombos ?? [];
    return combos.map((partial) => {
      const props = { ...base, ...partial };
      const axisValues: Record<string, string | boolean> = {};
      // Treat every key in partial as an axis value for labeling purposes
      for (const [k, v] of Object.entries(partial)) {
        if (typeof v === 'string' || typeof v === 'boolean') {
          axisValues[k] = v;
        }
      }
      const label = deriveLabel(axisValues);
      return { axisValues, props, label };
    });
  }

  // ── no axes → single combo ────────────────────────────────────────────────
  if (!entry.variantAxes || Object.keys(entry.variantAxes).length === 0) {
    return [{ axisValues: {}, props: { ...base }, label: 'default' }];
  }

  // ── cartesian mode (default) ──────────────────────────────────────────────
  const axisNames = Object.keys(entry.variantAxes);
  const axisValues = axisNames.map((name) => entry.variantAxes![name]);

  const cells = cartesian(axisValues);
  return cells.map((valueRow) => {
    const avMap: Record<string, string | boolean> = {};
    axisNames.forEach((name, i) => {
      avMap[name] = valueRow[i];
    });
    const props = { ...base, ...avMap };
    const label = deriveLabel(avMap);
    return { axisValues: avMap, props, label };
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function extractSchemaDefaults(entry: ComponentEntry): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(entry.propsSchema)) {
    if (spec.default !== undefined) {
      defaults[key] = spec.default;
    }
  }
  return defaults;
}

function deriveLabel(axisValues: Record<string, string | boolean>): string {
  const values = Object.values(axisValues);
  if (values.length === 0) return 'default';
  return values.map((v) => String(v)).join(' · ');
}

/** Cartesian product of an array of value arrays. */
function cartesian<T>(arrays: readonly (readonly T[])[]): T[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesian(rest);
  const result: T[][] = [];
  for (const v of first) {
    for (const row of restProduct) {
      result.push([v, ...row]);
    }
  }
  return result;
}
