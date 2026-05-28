/**
 * Provenance types for the Resolution Engine.
 *
 * Every resolution returns a `Resolved<V>` carrying the final value plus a
 * `Breakdown` (ordered list of `Source` entries). This shape extends the
 * existing `{ ac, formula }` pattern from sheet/armor-class.ts but is
 * drill-down-friendly for the mobile provenance UI (§2 — mobile-first).
 *
 * All types are plain JSON — no class instances, no functions on data.
 * Round-trip: JSON.stringify / JSON.parse is lossless.
 *
 * Design ref: sdd/resolution-engine/design — Source / Breakdown section.
 */
import type { StackCategory, ModifierInstanceId, DiceExpr } from './types.js';
import type { EntityRef } from './context.js';

// ── Source ────────────────────────────────────────────────────────────────────

/**
 * A single contributing source in a stat breakdown.
 *
 * - `label`: human-readable name suitable for mobile drill-down
 *   (e.g. "Bless (caster: Aria)", "Wild Shape (beast form)", "base").
 * - `amount`: the numeric or dice contribution from this source.
 * - `type`: the stacking category (untyped | item | status | circumstance).
 *   Also used as a discriminant tag for special entries (e.g. 'ReplaceMod',
 *   'AdvantageMod') when the consuming UI needs to distinguish them.
 * - `modifierId`: links back to the live modifier instance (optional; absent
 *   for synthetic sources like 'base').
 * - `origin`: WHO contributed this bonus — supports cross-entity provenance
 *   (Bless lives in the caster, not the target).
 * - `children`: nested sub-sources for drill-down (e.g. a compound bonus).
 */
export interface Source {
  label: string;
  amount: number | DiceExpr;
  /** Stacking category or special tag ('ReplaceMod', 'AdvantageMod'). */
  type: StackCategory | string;
  modifierId?: ModifierInstanceId;
  origin: EntityRef;
  children?: Source[];
}

// ── Breakdown ─────────────────────────────────────────────────────────────────

/**
 * Ordered list of sources that contributed to a resolved value.
 * First entry is typically the base (unmodified) value.
 */
export type Breakdown = Source[];

// ── Resolved<V> ───────────────────────────────────────────────────────────────

/**
 * The return shape for all resolution functions.
 *
 * `value`: the final resolved value (a number for most stats; string for
 *   special cases like dice expressions before rolling).
 * `breakdown`: ordered provenance trail.
 *
 * Extends the `{ ac, formula }` shape from sheet/armor-class.ts with a
 * typed, drill-down-ready breakdown list.
 */
export interface Resolved<V> {
  value: V;
  breakdown: Breakdown;
}
