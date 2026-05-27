/**
 * Lifted from apps/web/app/characters/[id]/wizard/spells/_picker.tsx:120
 *
 * Validates current spell picks against the limits and returns structured issues.
 * Empty array = valid; non-empty = at least one problem.
 *
 * REQ-CLU-XCUT-LIFT-VALIDATE-SPELLS-PICK: pure domain validation, no React, no IO.
 * REQ-CLU-XCUT-DOMAIN-LOCATION: lives in packages/domain/src/character/spellcasting/.
 */

import type { SpellLimitsView } from './preparation.js';
import type { AppliedClassSpells, SpellRef } from './validate-spells.js';

// ── Issue types ──────────────────────────────────────────────────────────────

export type SpellsPickIssueCode =
  | 'CANTRIPS_COUNT_MISMATCH'
  | 'SPELLS_KNOWN_COUNT_MISMATCH'
  | 'SPELLS_PREPARED_COUNT_MISMATCH';

export interface SpellsPickIssue {
  code: SpellsPickIssueCode;
  expected: number;
  got: number;
}

// ── Internal helpers (mirrored from _picker.tsx) ─────────────────────────────

type CasterMode = 'known' | 'prep' | 'wizard';

function deriveCasterMode(limits: SpellLimitsView): CasterMode {
  if (limits.wizardSpellbookSize !== undefined) return 'wizard';
  if (limits.spellsKnown !== null && limits.spellsPrepared === null) return 'known';
  return 'prep';
}

function spellKey(ref: SpellRef): string {
  return `${ref.slug}|${ref.source}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates in-flight spell picks against the limits shape.
 * Returns empty array when valid; one issue per constraint violation when invalid.
 *
 * Issue codes are distinct from server-side SpellsValidationIssue codes:
 *   CANTRIPS_COUNT_MISMATCH         — free cantrip count ≠ free cantrip limit
 *   SPELLS_KNOWN_COUNT_MISMATCH     — free known count ≠ free known limit
 *   SPELLS_PREPARED_COUNT_MISMATCH  — free prepared count ≠ free prepared limit
 *                                     (also used for wizard spellbook under-limit)
 */
export function validateSpellsPick(
  limits: SpellLimitsView,
  subclassGrantedSlugs: string[],
  value: AppliedClassSpells,
): SpellsPickIssue[] {
  const issues: SpellsPickIssue[] = [];
  const mode = deriveCasterMode(limits);
  const subclassGrantedSet = new Set(subclassGrantedSlugs);

  const cantripKeys = new Set(value.cantrips.map(spellKey));
  const knownKeys = new Set(value.known.map(spellKey));
  const preparedKeys = new Set(value.prepared.map(spellKey));

  // Subclass-granted keys (slug-only match — source not available in slugs array)
  const subclassGrantedCantripKeys = new Set<string>();
  const subclassGrantedLeveledKeys = new Set<string>();
  for (const r of value.cantrips) {
    if (subclassGrantedSet.has(r.slug)) subclassGrantedCantripKeys.add(spellKey(r));
  }
  for (const r of [...value.known, ...value.prepared]) {
    if (subclassGrantedSet.has(r.slug)) subclassGrantedLeveledKeys.add(spellKey(r));
  }

  // ── Cantrip check (all modes) ─────────────────────────────────────────────
  const freeCantripLimit = (limits.cantripsKnown ?? 0) - subclassGrantedCantripKeys.size;
  const freeCantripCount = [...cantripKeys].filter((k) => !subclassGrantedCantripKeys.has(k)).length;
  if (freeCantripLimit > 0 && freeCantripCount !== freeCantripLimit) {
    issues.push({ code: 'CANTRIPS_COUNT_MISMATCH', expected: freeCantripLimit, got: freeCantripCount });
  }

  // ── Leveled spell check (mode-dependent) ─────────────────────────────────
  if (mode === 'known') {
    const freeLimit = (limits.spellsKnown ?? 0) - subclassGrantedLeveledKeys.size;
    const freeCount = [...knownKeys].filter((k) => !subclassGrantedLeveledKeys.has(k)).length;
    if (freeLimit > 0 && freeCount !== freeLimit) {
      issues.push({ code: 'SPELLS_KNOWN_COUNT_MISMATCH', expected: freeLimit, got: freeCount });
    }
  } else if (mode === 'prep') {
    const freeLimit = (limits.spellsPrepared ?? 0) - subclassGrantedLeveledKeys.size;
    const freeCount = [...preparedKeys].filter((k) => !subclassGrantedLeveledKeys.has(k)).length;
    if (freeLimit > 0 && freeCount !== freeLimit) {
      issues.push({ code: 'SPELLS_PREPARED_COUNT_MISMATCH', expected: freeLimit, got: freeCount });
    }
  } else if (mode === 'wizard') {
    const minFreeKnown = (limits.wizardSpellbookSize ?? 0) - subclassGrantedLeveledKeys.size;
    const freeKnownCount = [...knownKeys].filter((k) => !subclassGrantedLeveledKeys.has(k)).length;
    if (minFreeKnown > 0 && freeKnownCount < minFreeKnown) {
      issues.push({ code: 'SPELLS_PREPARED_COUNT_MISMATCH', expected: minFreeKnown, got: freeKnownCount });
    }
  }

  return issues;
}
