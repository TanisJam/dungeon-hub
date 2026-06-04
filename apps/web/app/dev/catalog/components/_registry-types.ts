import type { ReactNode } from 'react';

// ── Prop descriptors ──────────────────────────────────────────────────────────

export type PropSpec =
  | { kind: 'enum'; options: readonly string[]; default?: string; label?: string }
  | { kind: 'boolean'; default?: boolean; label?: string }
  | { kind: 'string'; default?: string; label?: string }
  | { kind: 'number'; default?: number; label?: string }
  | { kind: 'node'; default?: ReactNode; label?: string };

/** A map from prop name to its declarative description. */
export type PropsSchema = Record<string, PropSpec>;

/**
 * Each key is a prop name whose values are spread across the matrix.
 * e.g. { tone: ['cta', 'green', 'ghost'], size: ['sm', 'md', 'lg'] }
 * Axis values must be a subset of the referenced prop's enum options
 * (or true/false for boolean axes).
 */
export type VariantAxes = Record<string, readonly (string | boolean)[]>;

/** One resolved cell in the variant matrix. */
export interface VariantCombination {
  /** Per-axis chosen values, e.g. { tone: 'cta', size: 'md' } or { name: 'shield', size: 32 } */
  axisValues: Record<string, string | number | boolean>;
  /** Full resolved props = schema defaults + fixedProps + axisValues */
  props: Record<string, unknown>;
  /** Human label derived from axis values joined with ' · ' */
  label: string;
}

export type ComponentGroup = 'ui' | 'layout' | 'sheet' | 'wizard' | 'form' | 'encuentros';

export interface ComponentEntry<P = Record<string, unknown>> {
  id: string;
  name: string;
  group: ComponentGroup;
  notes?: string;

  /** Declarative prop descriptions — rendered as a props table in the catalog. */
  propsSchema: PropsSchema;

  /** Optional axes to spread across the static matrix. Absent = single default render. */
  variantAxes?: VariantAxes;

  /** Props held constant across all matrix cells (e.g. children text). */
  fixedProps?: Partial<P>;

  /** Maps a resolved prop bag to the rendered node. */
  render: (props: P) => ReactNode;

  /**
   * 'cartesian' (default): full cartesian product of all axis value lists.
   * 'list': one cell per entry in explicitCombos (escape hatch for Icon's 22 names, etc.).
   */
  matrixMode?: 'cartesian' | 'list';

  /** Used when matrixMode === 'list'. Each partial is merged over schema defaults + fixedProps. */
  explicitCombos?: Partial<P>[];

  /** Preview wrapper per entry. Default: 'frame375' (375px constrained). */
  preview?: 'frame375' | 'bare';
}
