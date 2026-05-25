'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  ABILITY_KEYS,
  effectiveAsiSlots,
  formatAsisSummary,
  formatLanguages,
  formatSize,
  formatSpeed,
  extractTraits,
  parseAsis,
  parseLanguageChoices,
  countRaceSkillGrants,
  countRaceFeatGrants,
  type AbilityKey,
  type AsiSlot,
  type RaceData,
  type RaceInnateSpellLite,
} from './_parsers';
import { saveRace } from './actions';
import { RACES_REQUIRING_SUBRACE, requiresSubrace } from '@dungeon-hub/domain/character/race';
import { poolFor, titleCase } from '../background/_options';
import { ChoiceCard } from '@/components/wizard/choice-card';
import type { ChoiceOption } from '@/components/wizard/choice-list';
import { SubraceGroup } from './_subrace-group';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';

const LANG_KIND_LABEL: Record<string, string> = {
  anyStandard: 'idioma estándar',
  anyExotic: 'idioma exótico',
  any: 'idioma',
};
const LANG_CHOOSE_KEYS = ['anyStandard', 'anyExotic', 'any'] as const;

export type RaceEntry = {
  slug: string;
  source: string;
  name: string;
  isSubrace: boolean;
  parentSlug: string | null;
  parentSource: string | null;
  data: RaceData;
};

export type FeatEntry = {
  slug: string;
  source: string;
  name: string;
};

export type CantripEntry = {
  slug: string;
  source: string;
  name: string;
};

type Selection = {
  raceSlug: string;
  raceSource: string;
  subraceSlug: string | null;
  subraceSource: string | null;
};

function entryKey(e: { slug: string; source: string }): string {
  return `${e.slug}|${e.source}`;
}

function displayName(e: RaceEntry, all: RaceEntry[]): string {
  if (e.isSubrace && e.parentSlug) {
    const parent = all.find(
      (p) => p.slug === e.parentSlug && p.source === e.parentSource && !p.isSubrace,
    );
    if (parent) return `${e.name} ${parent.name}`;
  }
  return e.name;
}

/** Normalize a display name for cross-source merge grouping. */
function normalizeForMerge(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Source priority for variant ordering inside a merged card. PHB is canonical; supplements
 * fall back to alphabetical. Used to decide which variant is shown first in the chip selector.
 */
const SOURCE_PRIORITY: Record<string, number> = {
  PHB: 0, DMG: 1, MTF: 2, MPMM: 3, SCAG: 4, TCE: 5, XGE: 6, EGW: 7,
};
function compareSource(a: string, b: string): number {
  const pa = SOURCE_PRIORITY[a] ?? 99;
  const pb = SOURCE_PRIORITY[b] ?? 99;
  if (pa !== pb) return pa - pb;
  return a.localeCompare(b);
}

/**
 * A group of entries that share the same normalized display name across sources.
 * When `variants.length === 1` the card renders identically to a single entry.
 * When `variants.length > 1` the card prepends a source chip selector to its detail panel
 * so the user can switch which variant's mechanics drive the selection.
 */
type MergedEntry = {
  /** Normalized merge key — lowercase trimmed displayName. */
  normalizedName: string;
  /** Human-readable display name (taken from the primary/first variant). */
  displayName: string;
  /** Variants sorted by source priority (PHB first, then supplement alphabetical). */
  variants: RaceEntry[];
};

export function RacePicker({
  characterId,
  entries,
  allFeats = [],
  allWizardCantrips = [],
  initialSelection,
  initialChosenAsis = {},
  initialLanguageChoices = [],
  initialSkillChoices = [],
  initialFeatSlug = null,
  initialRaceCantrip = null,
}: {
  characterId: string;
  entries: RaceEntry[];
  allFeats?: FeatEntry[];
  /** Pool of wizard cantrips for the HighElfCantripPicker. PHB p.23. Decision #606. */
  allWizardCantrips?: CantripEntry[];
  initialSelection: Selection | null;
  initialChosenAsis?: Record<string, AbilityKey[]>;
  initialLanguageChoices?: string[];
  initialSkillChoices?: string[];
  initialFeatSlug?: string | null;
  /** Pre-selected wizard cantrip for High Elf re-edit flow. Decision #606. */
  initialRaceCantrip?: { slug: string; source: string } | null;
}) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (!initialSelection) return null;
    return initialSelection.subraceSlug
      ? `${initialSelection.subraceSlug}|${initialSelection.subraceSource}`
      : `${initialSelection.raceSlug}|${initialSelection.raceSource}`;
  });
  const [chosenAsis, setChosenAsis] = useState<Record<string, AbilityKey[]>>(initialChosenAsis);
  const [chosenLangs, setChosenLangs] = useState<string[]>(initialLanguageChoices);
  const [chosenSkills, setChosenSkills] = useState<string[]>(initialSkillChoices);
  const [chosenFeatSlug, setChosenFeatSlug] = useState<string | null>(
    initialFeatSlug ?? null,
  );
  const [chosenCantrip, setChosenCantrip] = useState<{ slug: string; source: string } | null>(
    initialRaceCantrip ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Per-MergedEntry active-variant override. Keyed by normalized display name.
   * When the user clicks a source chip on a merged card, we record their choice here
   * so the active variant persists across re-renders. Without an override the active
   * variant is derived from `selectedKey` (if the selection lives in the merge) or
   * defaults to index 0 (PHB-priority).
   */
  const [activeVariantByName, setActiveVariantByName] = useState<Record<string, number>>({});

  /**
   * Partition the entry list into three buckets:
   * - groups: parents with any subraces in data (accordion). Header is selectable
   *   when the parent is NOT in RACES_REQUIRING_SUBRACE (Half-Elf, Half-Orc, Tiefling, Human, etc.)
   *   and non-selectable for required-subrace races (Elf/Dwarf/Gnome/Halfling/Dragonborn PHB).
   * - standalones: base races without subraces in data (direct ChoiceCards)
   * - orphanGroups: subraces whose parent is filtered out (e.g. search matched the subrace but not the parent)
   *
   * Rationale: producing peer subrace cards next to a non-required parent (the previous
   * approach) yielded confusing titles like "Variant; Aquatic Elf Descent Half-Elf" floating
   * unanchored. Grouping all sub-raced races visually + making the PHB-base race selectable
   * via the header card preserves PHB-RAW semantics without losing the variants' affordance.
   */
  // RACES_REQUIRING_SUBRACE is a stable module-level constant — no memo needed.
  const requiredSubraceParents = RACES_REQUIRING_SUBRACE;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q
      ? entries
      : entries.filter((e) => {
          const display = displayName(e, entries).toLowerCase();
          return display.includes(q) || e.source.toLowerCase().includes(q);
        });
  }, [entries, query]);

  /**
   * Partition filtered entries into groups, standalones, and orphan groups.
   *
   * Three levels of same-name cross-source merging:
   * - SUBRACE level: subraces sharing the same normalized display name within a parent
   *   collapse into one MergedEntry.
   * - CROSS-LEVEL absorb: a base race (no subraces of its own) whose normalized name
   *   matches a SUBRACE name under some parent is absorbed into that parent's matching
   *   MergedEntry. Example: `sea-elf|MPMM` base race merges with the Sea Elf subrace
   *   under elf|PHB.
   * - PARENT level: non-required parents (Aasimar VGM with subraces, Aasimar MPMM and DMG
   *   without) sharing the same normalized name collapse into a single GroupItem whose
   *   parent header is a merged ChoiceCard with chips. The subraces shown below depend on
   *   the currently active parent variant. RACES_REQUIRING_SUBRACE parents (Elf PHB, etc.)
   *   never merge — they always emit as their own single-variant GroupItem.
   */
  const partitioned = useMemo(() => {
    const subracesByParent = new Map<string, RaceEntry[]>();
    for (const e of filtered) {
      if (e.isSubrace && e.parentSlug) {
        const key = `${e.parentSlug}|${e.parentSource}`;
        if (!subracesByParent.has(key)) subracesByParent.set(key, []);
        subracesByParent.get(key)!.push(e);
      }
    }
    for (const group of subracesByParent.values()) {
      group.sort((a, b) => displayName(a, entries).localeCompare(displayName(b, entries)));
    }

    const subraceNamesByParent = new Map<string, Map<string, RaceEntry[]>>();
    for (const [pKey, subs] of subracesByParent.entries()) {
      const byName = new Map<string, RaceEntry[]>();
      for (const s of subs) {
        const nm = normalizeForMerge(displayName(s, entries));
        if (!byName.has(nm)) byName.set(nm, []);
        byName.get(nm)!.push(s);
      }
      subraceNamesByParent.set(pKey, byName);
    }

    const parents = filtered
      .filter((e) => !e.isSubrace)
      .sort((a, b) => displayName(a, entries).localeCompare(displayName(b, entries)));

    // Cross-level absorption: a base race (no subraces of its own) gets absorbed iff its
    // normalized name matches a subrace name under some parent. Deterministic when multiple
    // parents qualify: alphabetical-first wins.
    const baseRaceAbsorptionTarget = new Map<string, { parentKey: string; nm: string }>();
    for (const p of parents) {
      const pKey = entryKey(p);
      const hasOwnSubraces = (subracesByParent.get(pKey)?.length ?? 0) > 0;
      if (hasOwnSubraces) continue;
      const nm = normalizeForMerge(displayName(p, entries));
      const matchingParentKeys = [...subraceNamesByParent.entries()]
        .filter(([_, byName]) => byName.has(nm))
        .map(([k]) => k)
        .sort();
      if (matchingParentKeys.length > 0) {
        baseRaceAbsorptionTarget.set(pKey, { parentKey: matchingParentKeys[0]!, nm });
      }
    }
    const absorbedBaseKeys = new Set<string>(baseRaceAbsorptionTarget.keys());

    function mergeEntries(list: RaceEntry[]): MergedEntry[] {
      const byName = new Map<string, RaceEntry[]>();
      for (const e of list) {
        const nm = normalizeForMerge(displayName(e, entries));
        if (!byName.has(nm)) byName.set(nm, []);
        byName.get(nm)!.push(e);
      }
      const merged: MergedEntry[] = [];
      for (const [nm, variants] of byName.entries()) {
        const sorted = [...variants].sort((a, b) => compareSource(a.source, b.source));
        merged.push({
          normalizedName: nm,
          displayName: displayName(sorted[0]!, entries),
          variants: sorted,
        });
      }
      merged.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return merged;
    }

    /** Merged subraces for a single parent variant: its own subraces + any absorbed base races. */
    function subracesForParent(variantKey: string): MergedEntry[] {
      const ownSubs = subracesByParent.get(variantKey) ?? [];
      const merged = mergeEntries(ownSubs);
      for (const [baseKey, target] of baseRaceAbsorptionTarget.entries()) {
        if (target.parentKey !== variantKey) continue;
        const baseEntry = parents.find((p) => entryKey(p) === baseKey);
        if (!baseEntry) continue;
        const slot = merged.find((m) => m.normalizedName === target.nm);
        if (slot) {
          slot.variants = [...slot.variants, baseEntry].sort((a, b) =>
            compareSource(a.source, b.source),
          );
        }
      }
      return merged;
    }

    type GroupItem = {
      kind: 'group';
      parentMerged: MergedEntry;
      /** Subraces per parent-variant idx, aligned with parentMerged.variants order. */
      subracesByVariantIdx: MergedEntry[][];
      autoExpand: boolean;
    };
    type StandaloneItem = { kind: 'standalone'; merged: MergedEntry };
    type ListItem = GroupItem | StandaloneItem;

    const items: ListItem[] = [];
    const emittedParentKeys = new Set<string>();

    // Pass 1: REQUIRED-subrace parents emit individually — they NEVER merge with other parents.
    // If no subraces present in the filtered entries (e.g. unit-test fixtures that omit them),
    // fall back to a standalone card so the "requiere sublinaje" pill / preflight hint remain visible.
    for (const p of parents) {
      const pKey = entryKey(p);
      if (absorbedBaseKeys.has(pKey)) continue;
      if (!requiredSubraceParents.has(pKey)) continue;
      emittedParentKeys.add(pKey);
      const subs = subracesForParent(pKey);
      const singletonMerged: MergedEntry = {
        normalizedName: normalizeForMerge(displayName(p, entries)),
        displayName: displayName(p, entries),
        variants: [p],
      };
      if (subs.length > 0) {
        items.push({
          kind: 'group',
          parentMerged: singletonMerged,
          subracesByVariantIdx: [subs],
          autoExpand: false,
        });
      } else {
        items.push({ kind: 'standalone', merged: singletonMerged });
      }
    }

    // Pass 2: Non-REQUIRED, non-absorbed parents — group by normalized name (parent-level merge).
    const nonReqByName = new Map<string, RaceEntry[]>();
    for (const p of parents) {
      const pKey = entryKey(p);
      if (absorbedBaseKeys.has(pKey)) continue;
      if (requiredSubraceParents.has(pKey)) continue;
      const nm = normalizeForMerge(displayName(p, entries));
      if (!nonReqByName.has(nm)) nonReqByName.set(nm, []);
      nonReqByName.get(nm)!.push(p);
    }

    for (const [nm, variants] of nonReqByName.entries()) {
      const sortedVariants = [...variants].sort((a, b) => compareSource(a.source, b.source));
      for (const v of sortedVariants) emittedParentKeys.add(entryKey(v));
      const parentMerged: MergedEntry = {
        normalizedName: nm,
        displayName: displayName(sortedVariants[0]!, entries),
        variants: sortedVariants,
      };
      const subracesByVariantIdx = sortedVariants.map((v) => subracesForParent(entryKey(v)));
      const hasAnySubraces = subracesByVariantIdx.some((s) => s.length > 0);
      if (hasAnySubraces) {
        items.push({
          kind: 'group',
          parentMerged,
          subracesByVariantIdx,
          autoExpand: false,
        });
      } else {
        items.push({ kind: 'standalone', merged: parentMerged });
      }
    }

    // Sort by display name
    function itemDisplayName(it: ListItem): string {
      return it.kind === 'group' ? it.parentMerged.displayName : it.merged.displayName;
    }
    items.sort((a, b) => itemDisplayName(a).localeCompare(itemDisplayName(b)));

    // Orphan groups: subraces whose parent is not in the filtered set
    const orphanByParent = new Map<string, { parent: RaceEntry | null; subraces: RaceEntry[] }>();
    for (const e of filtered) {
      if (e.isSubrace && e.parentSlug) {
        const key = `${e.parentSlug}|${e.parentSource}`;
        if (!emittedParentKeys.has(key)) {
          if (!orphanByParent.has(key)) {
            const parentEntry = entries.find(
              (p) => p.slug === e.parentSlug && p.source === e.parentSource && !p.isSubrace,
            ) ?? null;
            orphanByParent.set(key, { parent: parentEntry, subraces: [] });
          }
          orphanByParent.get(key)!.subraces.push(e);
        }
      }
    }
    for (const [_key, { parent, subraces }] of orphanByParent.entries()) {
      if (parent) {
        const merged = mergeEntries(subraces);
        items.push({
          kind: 'group',
          parentMerged: {
            normalizedName: normalizeForMerge(displayName(parent, entries)),
            displayName: displayName(parent, entries),
            variants: [parent],
          },
          subracesByVariantIdx: [merged],
          autoExpand: true,
        });
      }
    }

    return items;
  }, [filtered, entries, requiredSubraceParents]);

  const selected = useMemo(
    () => entries.find((e) => entryKey(e) === selectedKey) ?? null,
    [entries, selectedKey],
  );

  const parent = useMemo(() => {
    if (!selected?.isSubrace || !selected.parentSlug) return null;
    return (
      entries.find(
        (e) =>
          e.slug === selected.parentSlug &&
          e.source === selected.parentSource &&
          !e.isSubrace,
      ) ?? null
    );
  }, [entries, selected]);

  function handleContinue() {
    if (!selected) {
      setError('Elegí un linaje primero.');
      return;
    }
    setError(null);

    // Preflight: base race that requires a subrace. Domain is still source of
    // truth (the API will reject too), but we surface the error inline before
    // the round-trip so the user gets a fast signal.
    if (!selected.isSubrace && requiresSubrace({ slug: selected.slug, source: selected.source })) {
      setError('Elegí un sublinaje para esta raza.');
      return;
    }

    const racePart = selected.isSubrace && parent
      ? { slug: parent.slug, source: parent.source }
      : { slug: selected.slug, source: selected.source };
    const subracePart =
      selected.isSubrace ? { slug: selected.slug, source: selected.source } : null;

    const { raceSlots, subraceSlots } = effectiveAsiSlots({
      parentAbility: parent?.data.ability,
      selectedAbility: selected.data.ability,
      selectedIsSubrace: selected.isSubrace,
      selectedSlug: selected.slug,
      selectedSource: selected.source,
    });

    const appliedAsis: Array<{ ability: AbilityKey; bonus: number; source: 'race' | 'subrace' }> = [];
    const consume = (slots: AsiSlot[], source: 'race' | 'subrace') => {
      slots.forEach((slot, idx) => {
        if (slot.kind === 'fixed') {
          appliedAsis.push({ ability: slot.ability, bonus: slot.bonus, source });
        } else {
          const chosen = chosenAsis[`${source}:${idx}`] ?? [];
          if (chosen.length !== slot.count) {
            setError(`Elegí exactamente ${slot.count} atributo${slot.count > 1 ? 's' : ''}.`);
            throw new Error('asi-incomplete');
          }
          for (const a of chosen) {
            appliedAsis.push({ ability: a, bonus: slot.amount, source });
          }
        }
      });
    };

    try {
      consume(raceSlots, 'race');
      consume(subraceSlots, 'subrace');
    } catch {
      return;
    }

    const seen = new Set<string>();
    for (const a of appliedAsis) {
      if (seen.has(a.ability)) {
        setError(`Cada atributo solo puede incrementarse una vez. ${a.ability.toUpperCase()} aparece dos veces.`);
        return;
      }
      seen.add(a.ability);
    }

    // Idiomas: cantidad esperada = suma de slots any* de race + subrace.
    const langInfo = parseLanguageChoices({
      race: selected.isSubrace && parent ? parent.data : selected.data,
      subrace: selected.isSubrace ? selected.data : null,
    });
    if (chosenLangs.length !== langInfo.totalChooseCount) {
      setError(
        `Elegí ${langInfo.totalChooseCount} idioma${langInfo.totalChooseCount === 1 ? '' : 's'}.`,
      );
      return;
    }
    const langSeen = new Set<string>();
    const fixedSet = new Set(langInfo.fixed);
    for (const lang of chosenLangs) {
      const norm = lang.toLowerCase();
      if (fixedSet.has(norm) || langSeen.has(norm)) {
        setError(`No podés repetir idiomas. "${titleCase(lang)}" aparece dos veces o ya está otorgado.`);
        return;
      }
      langSeen.add(norm);
    }

    // Skills: validate count against race + subrace skillProficiencies grants.
    const raceDataForExtras = selected.isSubrace && parent ? parent.data : selected.data;
    const subraceDataForExtras = selected.isSubrace ? selected.data : null;
    const expectedSkillCount = countRaceSkillGrants({
      race: raceDataForExtras,
      subrace: subraceDataForExtras,
    });
    if (chosenSkills.length !== expectedSkillCount) {
      setError(
        expectedSkillCount > 0
          ? `Elegí ${expectedSkillCount} habilidad${expectedSkillCount === 1 ? '' : 'es'}.`
          : null,
      );
      if (expectedSkillCount > 0) return;
    }

    // Feat: validate required for races with feats:[{any:1}]
    const expectedFeatCount = countRaceFeatGrants({
      race: raceDataForExtras,
      subrace: subraceDataForExtras,
    });
    if (expectedFeatCount > 0 && !chosenFeatSlug) {
      setError('Elegí un talento racial.');
      return;
    }

    // Cantrip: validate when selected subrace has an isPlayerChoice spell entry (High Elf).
    // PHB p.23: "You know one cantrip of your choice from the wizard spell list."
    // Decision #606: player-choice cantrip picker lives in the race wizard step.
    const subraceSpells = (selected.data as RaceData & { additionalSpellsNormalized?: RaceInnateSpellLite[] }).additionalSpellsNormalized;
    const hasPlayerChoiceCantrip = subraceSpells?.some((s) => s.isPlayerChoice) ?? false;
    if (hasPlayerChoiceCantrip && !chosenCantrip) {
      setError('Elegí un cantrip de mago para tu linaje.');
      return;
    }

    // Build featChoice payload
    const featEntry = chosenFeatSlug
      ? allFeats.find((f) => f.slug === chosenFeatSlug) ?? null
      : null;
    const featChoicePayload =
      featEntry && expectedFeatCount > 0
        ? { slug: featEntry.slug, source: featEntry.source }
        : null;

    // Build raceCantrip payload (null for non-High-Elf races).
    const raceCantripPayload = hasPlayerChoiceCantrip ? (chosenCantrip ?? null) : null;

    startTransition(async () => {
      const res = await saveRace(
        characterId,
        racePart,
        subracePart,
        appliedAsis,
        chosenLangs,
        expectedSkillCount > 0 ? chosenSkills : [],
        featChoicePayload,
        raceCantripPayload,
      );
      if (res.error) setError(res.error);
    });
  }

  /**
   * Determine which variant of a MergedEntry is currently "active" — the one whose
   * mechanics drive the card's detail panel and would be persisted on selection.
   *
   * Priority: explicit user chip override > matches selectedKey > first variant (PHB-priority).
   */
  function getActiveIdx(m: MergedEntry): number {
    const stored = activeVariantByName[m.normalizedName];
    if (stored !== undefined && stored >= 0 && stored < m.variants.length) return stored;
    const fromSelection = m.variants.findIndex((v) => entryKey(v) === selectedKey);
    if (fromSelection >= 0) return fromSelection;
    return 0;
  }

  /**
   * Switch the active variant of a merged card. If the card is currently selected,
   * also update `selectedKey` to point at the new variant so the chip and the selection stay in sync.
   */
  function switchVariant(m: MergedEntry, newIdx: number) {
    setActiveVariantByName({ ...activeVariantByName, [m.normalizedName]: newIdx });
    const isMergeSelected = m.variants.some((v) => entryKey(v) === selectedKey);
    if (isMergeSelected) {
      const newKey = entryKey(m.variants[newIdx]!);
      if (newKey !== selectedKey) {
        // Reset per-source picks because mechanics may differ between variants.
        setChosenAsis({});
        setChosenLangs([]);
        setChosenSkills([]);
        setChosenFeatSlug(null);
        setChosenCantrip(null);
        setSelectedKey(newKey);
        setError(null);
      }
    }
  }

  /**
   * Build a ChoiceOption for a MergedEntry. Single-variant merges render identically to
   * a single RaceEntry. Multi-variant merges prepend a source chip selector to the detail panel.
   */
  function buildMergedOption(m: MergedEntry): ChoiceOption<string> {
    const activeIdx = getActiveIdx(m);
    const active = m.variants[activeIdx]!;
    const baseOpt = buildOption(active);
    if (m.variants.length === 1) return baseOpt;
    return {
      ...baseOpt,
      detail: (
        <div className="space-y-3">
          <SourceChipSelector
            variants={m.variants}
            activeIdx={activeIdx}
            onSelect={(idx) => switchVariant(m, idx)}
          />
          {baseOpt.detail}
        </div>
      ),
    };
  }

  /** Build a ChoiceOption for any single RaceEntry. Used by both standalone cards and subrace group items. */
  function buildOption(e: RaceEntry): ChoiceOption<string> {
    const key = entryKey(e);
    const asis = parseAsis(e.data.ability);
    const asiSummary = formatAsisSummary(asis);
    const speedStr = formatSpeed(e.data.speed);
    const sizeStr = formatSize(e.data.size);

    const pills: ChoiceOption<string>['pills'] = [];
    if (!e.isSubrace && requiresSubrace({ slug: e.slug, source: e.source })) {
      pills.push({ tone: 'amber', label: 'requiere sublinaje' });
    }
    if (asiSummary && asiSummary !== '—') {
      pills.push({ tone: 'amber', label: asiSummary });
    }
    if (sizeStr) {
      const SIZE_ES: Record<string, string> = { Tiny: 'Diminuto', Small: 'Pequeño', Medium: 'Mediano', Large: 'Grande', Huge: 'Enorme', Gargantuan: 'Gargantuesco' };
      pills.push({ tone: 'stone', label: SIZE_ES[sizeStr] ?? sizeStr });
    }
    if (speedStr) {
      pills.push({ tone: 'stone', label: speedStr });
    }
    pills.push({ tone: 'stone', label: e.source });

    const parentEntry = e.isSubrace && e.parentSlug
      ? entries.find((p) => p.slug === e.parentSlug && p.source === e.parentSource && !p.isSubrace) ?? null
      : null;

    const isThisSelected = key === selectedKey;

    return {
      key,
      title: displayName(e, entries),
      subtitle: e.isSubrace && parentEntry ? `Sublinaje de ${parentEntry.name}` : undefined,
      pills,
      detail: (
        <RaceDetailPanel
          entry={e}
          parent={parentEntry}
          allFeats={allFeats}
          allWizardCantrips={allWizardCantrips}
          chosenAsis={chosenAsis}
          setChosenAsis={(next) => {
            setChosenAsis(next);
            setError(null);
          }}
          chosenLangs={isThisSelected ? chosenLangs : []}
          setChosenLangs={(next) => {
            setChosenLangs(next);
            setError(null);
          }}
          chosenSkills={isThisSelected ? chosenSkills : []}
          setChosenSkills={(next) => {
            setChosenSkills(next);
            setError(null);
          }}
          chosenFeatSlug={isThisSelected ? chosenFeatSlug : null}
          setChosenFeatSlug={(next) => {
            setChosenFeatSlug(next);
            setError(null);
          }}
          chosenCantrip={isThisSelected ? chosenCantrip : null}
          setChosenCantrip={(next) => {
            setChosenCantrip(next);
            setError(null);
          }}
        />
      ),
    };
  }

  function handleSelect(key: string | null) {
    if (key !== selectedKey) {
      setChosenAsis({});
      setChosenLangs([]);
      setChosenSkills([]);
      setChosenFeatSlug(null);
      setChosenCantrip(null);
    }
    setSelectedKey(key);
    setError(null);
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="search"
        placeholder="Buscar linaje…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none"
      />

      {partitioned.length === 0 ? (
        <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-xs text-ink-mute">
          Sin resultados.
        </div>
      ) : (
        <div className="space-y-2">
          {partitioned.map((item) => {
            if (item.kind === 'group') {
              const { parentMerged, subracesByVariantIdx, autoExpand } = item;
              const activeIdx = getActiveIdx(parentMerged);
              const activeParent = parentMerged.variants[activeIdx]!;
              const activeSubraces = subracesByVariantIdx[activeIdx] ?? [];
              const parentSelectable = !requiredSubraceParents.has(entryKey(activeParent));

              // Auto-expand only when the current selection is one of the variant subraces.
              // A selected parent variant does NOT auto-expand — the chip selector lives
              // inside the (already-visible) parent detail panel, so the variants list can
              // stay collapsed unless the user explicitly chose a variant.
              const selectionInSubraces = activeSubraces.some((m) =>
                m.variants.some((v) => entryKey(v) === selectedKey),
              );

              const subraceOptions = activeSubraces.map((m) => buildMergedOption(m));
              // Parent option: when the parent merge has 2+ variants, the chip selector lives
              // inside parentOption.detail via buildMergedOption. When parentSelectable=false
              // (RACES_REQUIRING_SUBRACE), parentMerged has only 1 variant by construction.
              const parentOption = parentSelectable ? buildMergedOption(parentMerged) : undefined;

              return (
                <SubraceGroup
                  key={parentMerged.normalizedName}
                  parentName={activeParent.name}
                  parentSlug={activeParent.slug}
                  subraces={subraceOptions}
                  selectedSubraceKey={selectedKey}
                  defaultOpen={selectionInSubraces || autoExpand}
                  onSelect={handleSelect}
                  parentSelectable={parentSelectable}
                  parentOption={parentOption}
                />
              );
            } else {
              // Standalone: a merged card (1+ variants), no subraces under any variant
              const opt = buildMergedOption(item.merged);
              const isSelected = item.merged.variants.some((v) => entryKey(v) === selectedKey);
              return (
                <ChoiceCard
                  key={opt.key}
                  id={opt.key}
                  title={opt.title}
                  subtitle={opt.subtitle}
                  pills={opt.pills}
                  selected={isSelected}
                  onClick={() => handleSelect(isSelected ? null : opt.key)}
                  detail={opt.detail}
                />
              );
            }
          })}
        </div>
      )}

      <WizardFooterNav
        backHref={`/characters/${characterId}/wizard/stats`}
        onNext={handleContinue}
        pending={pending}
        disabled={!selected}
        error={error}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel (moved inline into ChoiceCard)
// ---------------------------------------------------------------------------

function RaceDetailPanel({
  entry,
  parent,
  allFeats,
  allWizardCantrips,
  chosenAsis,
  setChosenAsis,
  chosenLangs,
  setChosenLangs,
  chosenSkills,
  setChosenSkills,
  chosenFeatSlug,
  setChosenFeatSlug,
  chosenCantrip,
  setChosenCantrip,
}: {
  entry: RaceEntry;
  parent: RaceEntry | null;
  allFeats: FeatEntry[];
  allWizardCantrips: CantripEntry[];
  chosenAsis: Record<string, AbilityKey[]>;
  setChosenAsis: (next: Record<string, AbilityKey[]>) => void;
  chosenLangs: string[];
  setChosenLangs: (next: string[]) => void;
  chosenSkills: string[];
  setChosenSkills: (next: string[]) => void;
  chosenFeatSlug: string | null;
  setChosenFeatSlug: (next: string | null) => void;
  chosenCantrip: { slug: string; source: string } | null;
  setChosenCantrip: (next: { slug: string; source: string } | null) => void;
}) {
  const traits = useMemo(() => {
    const own = extractTraits(entry.data.entries);
    if (!parent) return own;
    return [...extractTraits(parent.data.entries), ...own];
  }, [entry, parent]);

  const langInfo = useMemo(
    () =>
      parseLanguageChoices({
        race: entry.isSubrace && parent ? parent.data : entry.data,
        subrace: entry.isSubrace ? entry.data : null,
      }),
    [entry, parent],
  );
  const size = formatSize(entry.data.size);
  const speed = formatSpeed(entry.data.speed);

  const fixedLangs = langInfo.fixed;
  const hasLangChoices = langInfo.totalChooseCount > 0;

  const raceDataForExtras = entry.isSubrace && parent ? parent.data : entry.data;
  const subraceDataForExtras = entry.isSubrace ? entry.data : null;
  const expectedSkillCount = countRaceSkillGrants({
    race: raceDataForExtras,
    subrace: subraceDataForExtras,
  });
  const expectedFeatCount = countRaceFeatGrants({
    race: raceDataForExtras,
    subrace: subraceDataForExtras,
  });

  // Detect player-choice cantrip slot (High Elf, PHB p.23).
  // Reads from the subrace's additionalSpellsNormalized — if any entry has isPlayerChoice:true,
  // the HighElfCantripPicker is shown. Decision #606.
  const subraceSpells = (entry.isSubrace ? entry.data : null) as
    | (RaceData & { additionalSpellsNormalized?: RaceInnateSpellLite[] })
    | null;
  const hasPlayerChoiceCantrip =
    subraceSpells?.additionalSpellsNormalized?.some((s) => s.isPlayerChoice) ?? false;

  return (
    <div className="space-y-3">
      {!entry.isSubrace && requiresSubrace({ slug: entry.slug, source: entry.source }) && (
        <p className="rounded-md border border-accent-soft bg-paper px-2.5 py-1.5 text-xs text-accent-deep">
          Esta raza requiere un sublinaje. Elegí uno de los sublinajes listados.
        </p>
      )}

      <p className="text-xs text-ink-mute">
        {size} · Velocidad {speed} · {entry.source}
      </p>

      <AsiSection
        parent={parent}
        entry={entry}
        chosen={chosenAsis}
        setChosen={setChosenAsis}
      />

      {(fixedLangs.length > 0 || hasLangChoices) && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Idiomas</p>
          {fixedLangs.length > 0 && (
            <p className="mt-1 text-xs">
              <span className="text-ink-mute">Otorgados:</span>{' '}
              <span className="text-ink">{fixedLangs.map(titleCase).join(', ')}</span>
            </p>
          )}
          {hasLangChoices && (
            <LanguageChoosers
              chooseCounts={langInfo.chooseCounts}
              fixedLangs={fixedLangs}
              chosen={chosenLangs}
              setChosen={setChosenLangs}
            />
          )}
        </div>
      )}

      {expectedSkillCount > 0 && (
        <RaceSkillPicker
          count={expectedSkillCount}
          chosen={chosenSkills}
          setChosen={setChosenSkills}
        />
      )}

      {expectedFeatCount > 0 && (
        <RaceFeatPicker
          allFeats={allFeats}
          chosenSlug={chosenFeatSlug}
          setChosenSlug={setChosenFeatSlug}
        />
      )}

      {hasPlayerChoiceCantrip && allWizardCantrips.length > 0 && (
        <HighElfCantripPicker
          cantrips={allWizardCantrips}
          chosen={chosenCantrip}
          setChosen={setChosenCantrip}
        />
      )}

      {traits.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Rasgos</p>
          <ul className="mt-1 space-y-1.5 text-xs">
            {traits.map((t, i) => (
              <li key={i}>
                <span className="font-semibold text-ink">{t.name}.</span>{' '}
                <span className="text-ink-soft">{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AsiSection({
  parent,
  entry,
  chosen,
  setChosen,
}: {
  parent: RaceEntry | null;
  entry: RaceEntry;
  chosen: Record<string, AbilityKey[]>;
  setChosen: (next: Record<string, AbilityKey[]>) => void;
}) {
  const { raceSlots, subraceSlots } = effectiveAsiSlots({
    parentAbility: parent?.data.ability,
    selectedAbility: entry.data.ability,
    selectedIsSubrace: entry.isSubrace,
    selectedSlug: entry.slug,
    selectedSource: entry.source,
  });

  const parentAbilityEmpty = parent && !(parent.data.ability && parent.data.ability.length > 0);
  const entryAbilityEmpty = !(entry.data.ability && entry.data.ability.length > 0);
  const isMpmmSynthetic = parentAbilityEmpty && entryAbilityEmpty;

  return (
    <>
      {raceSlots.length > 0 && (
        <AsiBlock
          slots={raceSlots}
          source="race"
          label={isMpmmSynthetic ? 'Incremento de atributo (2024 / MPMM)' : 'Incremento de atributo'}
          chosen={chosen}
          setChosen={setChosen}
        />
      )}
      {subraceSlots.length > 0 && (
        <AsiBlock
          slots={subraceSlots}
          source="subrace"
          label="Incremento de atributo (sublinaje)"
          chosen={chosen}
          setChosen={setChosen}
        />
      )}
    </>
  );
}

function AsiBlock({
  slots,
  source,
  label,
  chosen,
  setChosen,
}: {
  slots: AsiSlot[];
  source: 'race' | 'subrace';
  label: string;
  chosen: Record<string, AbilityKey[]>;
  setChosen: (next: Record<string, AbilityKey[]>) => void;
}) {
  if (slots.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">{label}</p>
      <div className="mt-1 space-y-2">
        {slots.map((slot, idx) => {
          if (slot.kind === 'fixed') {
            const sign = slot.bonus >= 0 ? '+' : '';
            return (
              <p key={idx} className="text-xs">
                <span className="font-mono font-bold text-ink">
                  {sign}{slot.bonus} {slot.ability.toUpperCase()}
                </span>
              </p>
            );
          }
          return (
            <AsiChooser
              key={idx}
              slot={slot}
              storageKey={`${source}:${idx}`}
              chosen={chosen}
              setChosen={setChosen}
            />
          );
        })}
      </div>
    </div>
  );
}

function AsiChooser({
  slot,
  storageKey,
  chosen,
  setChosen,
}: {
  slot: Extract<AsiSlot, { kind: 'choose' }>;
  storageKey: string;
  chosen: Record<string, AbilityKey[]>;
  setChosen: (next: Record<string, AbilityKey[]>) => void;
}) {
  const selected = chosen[storageKey] ?? [];

  function toggle(ability: AbilityKey) {
    const has = selected.includes(ability);
    let next: AbilityKey[];
    if (has) next = selected.filter((a) => a !== ability);
    else if (selected.length >= slot.count) return;
    else next = [...selected, ability];
    setChosen({ ...chosen, [storageKey]: next });
  }

  const pool = slot.from.length > 0 ? slot.from : ABILITY_KEYS;

  return (
    <div className="rounded-md border border-accent-soft bg-paper p-2.5">
      <p className="text-[10px] font-semibold text-accent-deep">
        Elegí {slot.count} atributo{slot.count > 1 ? 's' : ''} para +{slot.amount}:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pool.map((a) => {
          const isOn = selected.includes(a);
          const disabled = !isOn && selected.length >= slot.count;
          return (
            <button
              key={a}
              type="button"
              onClick={() => toggle(a)}
              disabled={disabled}
              className={[
                'rounded px-2 py-1 text-xs font-mono ring-1 ring-inset transition',
                isOn
                  ? 'bg-accent-soft text-accent-deep ring-accent'
                  : 'text-ink-soft ring-line hover:ring-accent-soft disabled:opacity-30',
              ].join(' ')}
            >
              {a.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language pickers (one block per kind: anyStandard / anyExotic / any)
// ---------------------------------------------------------------------------

function LanguageChoosers({
  chooseCounts,
  fixedLangs,
  chosen,
  setChosen,
}: {
  chooseCounts: Record<string, number>;
  fixedLangs: string[];
  chosen: string[];
  setChosen: (next: string[]) => void;
}) {
  const fixedSet = new Set(fixedLangs);
  return (
    <div className="mt-2 space-y-2">
      {LANG_CHOOSE_KEYS.map((kind) => {
        const count = chooseCounts[kind];
        if (!count) return null;
        const pool = poolFor(kind).filter((p) => !fixedSet.has(p));
        const selectedInPool = chosen.filter((c) => pool.includes(c));
        const setSelectedInPool = (vals: string[]) => {
          const others = chosen.filter((c) => !pool.includes(c));
          setChosen([...others, ...vals]);
        };
        return (
          <LangMultiSelect
            key={kind}
            label={`Elegí ${count} ${LANG_KIND_LABEL[kind]}${count > 1 ? 's' : ''}`}
            pool={pool}
            selected={selectedInPool}
            count={count}
            onChange={setSelectedInPool}
          />
        );
      })}
    </div>
  );
}

function LangMultiSelect({
  label,
  pool,
  selected,
  count,
  onChange,
}: {
  label: string;
  pool: string[];
  selected: string[];
  count: number;
  onChange: (vals: string[]) => void;
}) {
  function toggle(v: string) {
    const has = selected.includes(v);
    if (has) onChange(selected.filter((x) => x !== v));
    else if (selected.length >= count) return;
    else onChange([...selected, v]);
  }
  return (
    <div className="rounded-md border border-accent-soft bg-paper p-2.5">
      <p className="text-[10px] font-semibold text-accent-deep">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pool.map((v) => {
          const isOn = selected.includes(v);
          const disabled = !isOn && selected.length >= count;
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              disabled={disabled}
              className={[
                'rounded px-2 py-1 text-xs ring-1 ring-inset transition',
                isOn
                  ? 'bg-accent-soft text-accent-deep ring-accent'
                  : 'text-ink-soft ring-line hover:ring-accent-soft disabled:opacity-30',
              ].join(' ')}
            >
              {titleCase(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Race Skill Picker — for races with skillProficiencies:[{any:N}]
// (Variant Human ×1, Half-Elf ×2, etc.)
// ---------------------------------------------------------------------------

const ALL_SKILL_KEYS = [
  'acrobatics', 'animal handling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine',
  'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleight of hand', 'stealth', 'survival',
] as const;

function RaceSkillPicker({
  count,
  chosen,
  setChosen,
}: {
  count: number;
  chosen: string[];
  setChosen: (next: string[]) => void;
}) {
  function toggle(skill: string) {
    const has = chosen.includes(skill);
    if (has) setChosen(chosen.filter((s) => s !== skill));
    else if (chosen.length >= count) return;
    else setChosen([...chosen, skill]);
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Habilidades de linaje
      </p>
      <p className="mt-0.5 text-[10px] text-ink-mute">
        Elegí {count} habilidad{count === 1 ? '' : 'es'}:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALL_SKILL_KEYS.map((skill) => {
          const isOn = chosen.includes(skill);
          const disabled = !isOn && chosen.length >= count;
          return (
            <button
              key={skill}
              type="button"
              onClick={() => toggle(skill)}
              disabled={disabled}
              className={[
                'rounded px-2 py-1 text-xs ring-1 ring-inset transition',
                isOn
                  ? 'bg-accent-soft text-accent-deep ring-accent'
                  : 'text-ink-soft ring-line hover:ring-accent-soft disabled:opacity-30',
              ].join(' ')}
            >
              {titleCase(skill)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Race Feat Picker — for races with feats:[{any:1}] (Variant Human)
// ---------------------------------------------------------------------------

function RaceFeatPicker({
  allFeats,
  chosenSlug,
  setChosenSlug,
}: {
  allFeats: FeatEntry[];
  chosenSlug: string | null;
  setChosenSlug: (next: string | null) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allFeats;
    return allFeats.filter((f) => f.name.toLowerCase().includes(q));
  }, [allFeats, query]);

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Talento racial
      </p>
      <p className="mt-0.5 text-[10px] text-ink-mute">
        Elegí 1 talento:
      </p>
      <input
        type="search"
        placeholder="Buscar talento…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-1.5 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none"
      />
      <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-line bg-paper">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-mute">Sin resultados.</p>
        ) : (
          filtered.map((feat) => {
            const isOn = chosenSlug === feat.slug;
            return (
              <button
                key={`${feat.slug}|${feat.source}`}
                type="button"
                onClick={() => setChosenSlug(isOn ? null : feat.slug)}
                className={[
                  'w-full px-3 py-1.5 text-left text-xs transition hover:bg-accent-soft/40',
                  isOn ? 'bg-accent-soft text-accent-deep font-semibold' : 'text-ink',
                ].join(' ')}
              >
                {feat.name}
                <span className="ml-1 text-ink-mute">· {feat.source}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// High Elf Cantrip Picker — for High Elf isPlayerChoice wizard cantrip slot
// PHB p.23: "You know one cantrip of your choice from the wizard spell list."
// Decision #606. Batch 6 (race-additional-spells).
// ---------------------------------------------------------------------------

function HighElfCantripPicker({
  cantrips,
  chosen,
  setChosen,
}: {
  cantrips: CantripEntry[];
  chosen: { slug: string; source: string } | null;
  setChosen: (next: { slug: string; source: string } | null) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cantrips;
    return cantrips.filter((c) => c.name.toLowerCase().includes(q));
  }, [cantrips, query]);

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Cantrip de linaje
      </p>
      <p className="mt-0.5 text-[10px] text-ink-mute">
        Elegí 1 cantrip de mago (PHB p.23):
      </p>
      <input
        type="search"
        placeholder="Buscar cantrip…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-1.5 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none"
      />
      <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-line bg-paper">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-mute">Sin resultados.</p>
        ) : (
          filtered.map((c) => {
            const isOn = chosen?.slug === c.slug;
            return (
              <button
                key={`${c.slug}|${c.source}`}
                type="button"
                onClick={() => setChosen(isOn ? null : { slug: c.slug, source: c.source })}
                className={[
                  'w-full px-3 py-1.5 text-left text-xs transition hover:bg-accent-soft/40',
                  isOn ? 'bg-accent-soft text-accent-deep font-semibold' : 'text-ink',
                ].join(' ')}
              >
                {c.name}
                <span className="ml-1 text-ink-mute">· {c.source}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source chip selector — shown inside a merged card's detail panel when the
// same display name exists across multiple sources (Sea Elf PHB+MPMM, Deep
// Gnome PHB-MTF+MPMM, etc.). Clicking a chip switches the variant whose
// mechanics drive the card and (if the card is selected) follows the selection.
// ---------------------------------------------------------------------------

function SourceChipSelector({
  variants,
  activeIdx,
  onSelect,
}: {
  variants: RaceEntry[];
  activeIdx: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="rounded-md border border-accent-soft bg-paper p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-accent-deep">
        Fuente · {variants.length} variantes
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {variants.map((v, i) => {
          const isOn = i === activeIdx;
          return (
            <button
              key={`${v.slug}|${v.source}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(i);
              }}
              className={[
                'rounded px-2 py-1 text-xs font-mono ring-1 ring-inset transition',
                isOn
                  ? 'bg-accent-soft text-accent-deep ring-accent'
                  : 'text-ink-soft ring-line hover:ring-accent-soft',
              ].join(' ')}
            >
              {v.source}
            </button>
          );
        })}
      </div>
    </div>
  );
}
