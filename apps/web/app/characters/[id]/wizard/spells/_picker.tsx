'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pill } from '@/components/ui/pill';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';
import { decodeSchool } from '@/lib/spells/school-decode';
import { saveSpells } from './actions';

// ── Types ──────────────────────────────────────────────────────────────────

type SpellRef = { slug: string; source: string };

type AvailableSpell = {
  slug: string;
  source: string;
  name: string;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  componentsMCost: number | null;
};

type SpellLimitsView = {
  cantripsKnown: number;
  spellsKnown: number | null;
  spellsPrepared: number | null;
  maxSpellLevel: number;
  wizardSpellbookSize?: number;
  ability: 'int' | 'wis' | 'cha' | null;
};

type InitialSpells = {
  cantrips: SpellRef[];
  known: SpellRef[];
  prepared: SpellRef[];
};

export type SpellsPickerProps = {
  characterId: string;
  classSlug: string;
  classSource: string;
  limits: SpellLimitsView;
  availableSpells: AvailableSpell[];
  subclassGrantedSlugs: string[];
  initialSpells: InitialSpells;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function spellKey(slug: string, source: string): string {
  return `${slug}|${source}`;
}

function parseKey(key: string): SpellRef {
  const [slug, source] = key.split('|');
  return { slug: slug ?? '', source: source ?? '' };
}

function refToKey(ref: SpellRef): string {
  return spellKey(ref.slug, ref.source);
}

function toggleSet(prev: Set<string>, key: string, checked: boolean): Set<string> {
  const next = new Set(prev);
  if (checked) next.add(key);
  else next.delete(key);
  return next;
}

/**
 * Derive the caster mode from the limits shape.
 * 'wizard'  — has wizardSpellbookSize (Phase D handles the two-column; Phase C renders single column placeholder)
 * 'known'   — spellsKnown is non-null, spellsPrepared is null (Bard / Sorc / Warlock / Ranger)
 * 'prep'    — spellsPrepared is non-null, spellsKnown is null (Cleric / Druid / Paladin / Artificer)
 */
type CasterMode = 'known' | 'prep' | 'wizard';

function deriveCasterMode(limits: SpellLimitsView): CasterMode {
  if (limits.wizardSpellbookSize !== undefined) return 'wizard';
  if (limits.spellsKnown !== null && limits.spellsPrepared === null) return 'known';
  return 'prep';
}

function pluralizeCantrips(n: number): string {
  return n === 1 ? 'cantrip' : 'cantrips';
}

function pluralizeHechizos(n: number): string {
  return n === 1 ? 'hechizo de nivel 1' : 'hechizos de nivel 1';
}

function buildHeaderSummary(limits: SpellLimitsView, mode: CasterMode): string {
  const parts: string[] = [];
  if (limits.cantripsKnown > 0) {
    parts.push(`${limits.cantripsKnown} ${pluralizeCantrips(limits.cantripsKnown)}`);
  }
  if (mode === 'known' && limits.spellsKnown !== null && limits.spellsKnown > 0) {
    parts.push(`${limits.spellsKnown} ${pluralizeHechizos(limits.spellsKnown)}`);
  }
  if (mode === 'prep' && limits.spellsPrepared !== null && limits.spellsPrepared > 0) {
    parts.push(`${limits.spellsPrepared} ${pluralizeHechizos(limits.spellsPrepared)}`);
  }
  if (mode === 'wizard') {
    if (limits.wizardSpellbookSize !== undefined && limits.wizardSpellbookSize > 0) {
      parts.push(`${limits.wizardSpellbookSize} ${pluralizeHechizos(limits.wizardSpellbookSize)} (spellbook)`);
    }
  }
  if (parts.length === 0) return 'No hay hechizos que elegir.';
  return `Elegí ${parts.join(' y ')}.`;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function SpellsPicker({
  characterId,
  classSlug,
  limits,
  availableSpells,
  subclassGrantedSlugs,
  initialSpells,
}: SpellsPickerProps) {
  const casterMode = useMemo(() => deriveCasterMode(limits), [limits]);

  // Subclass-granted keys (slug-only comparison; source not in the slugs array)
  const subclassGrantedSet = useMemo(() => new Set(subclassGrantedSlugs), [subclassGrantedSlugs]);

  // Build initial key sets from saved refs + subclass grants
  const [cantripKeys, setCantripKeys] = useState<Set<string>>(() => {
    const s = new Set(initialSpells.cantrips.map(refToKey));
    // Subclass-granted cantrips: find from availableSpells and seed in
    for (const spell of availableSpells) {
      if (spell.level === 0 && subclassGrantedSet.has(spell.slug)) {
        s.add(spellKey(spell.slug, spell.source));
      }
    }
    return s;
  });

  const [knownKeys, setKnownKeys] = useState<Set<string>>(() => {
    const s = new Set(initialSpells.known.map(refToKey));
    if (casterMode === 'wizard') {
      for (const spell of availableSpells) {
        if (spell.level > 0 && subclassGrantedSet.has(spell.slug)) {
          s.add(spellKey(spell.slug, spell.source));
        }
      }
    }
    return s;
  });

  const [preparedKeys, setPreparedKeys] = useState<Set<string>>(() => {
    const s = new Set(initialSpells.prepared.map(refToKey));
    // Prep casters: subclass spells seed into preparedKeys
    for (const spell of availableSpells) {
      if (spell.level > 0 && subclassGrantedSet.has(spell.slug)) {
        s.add(spellKey(spell.slug, spell.source));
      }
    }
    return s;
  });

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ── Derived spell lists ──────────────────────────────────────────────────

  const cantripList = useMemo(
    () => availableSpells.filter((s) => s.level === 0),
    [availableSpells],
  );

  const leveledByLevel = useMemo(() => {
    const map = new Map<number, AvailableSpell[]>();
    for (const spell of availableSpells) {
      if (spell.level < 1) continue;
      const arr = map.get(spell.level) ?? [];
      arr.push(spell);
      map.set(spell.level, arr);
    }
    return map;
  }, [availableSpells]);

  // ── Active leveled key set for non-Wizard single-column ─────────────────

  // For known-casters: the checkbox writes to knownKeys
  // For prep-casters: the checkbox writes to preparedKeys
  const activeLeveledKeys = casterMode === 'known' ? knownKeys : preparedKeys;
  const setActiveLeveledKeys = casterMode === 'known' ? setKnownKeys : setPreparedKeys;

  // ── Effective subclass counts for counter display ─────────────────────────
  // Subclass-granted keys that are locked should not count toward the player quota
  const subclassGrantedCantripKeys = useMemo(() => {
    const s = new Set<string>();
    for (const spell of availableSpells) {
      if (spell.level === 0 && subclassGrantedSet.has(spell.slug)) {
        s.add(spellKey(spell.slug, spell.source));
      }
    }
    return s;
  }, [availableSpells, subclassGrantedSet]);

  const subclassGrantedLeveledKeys = useMemo(() => {
    const s = new Set<string>();
    for (const spell of availableSpells) {
      if (spell.level > 0 && subclassGrantedSet.has(spell.slug)) {
        s.add(spellKey(spell.slug, spell.source));
      }
    }
    return s;
  }, [availableSpells, subclassGrantedSet]);

  // Free picks = selected minus subclass-granted
  const freeCantripCount = useMemo(
    () => [...cantripKeys].filter((k) => !subclassGrantedCantripKeys.has(k)).length,
    [cantripKeys, subclassGrantedCantripKeys],
  );

  const freeLeveledCount = useMemo(() => {
    return [...activeLeveledKeys].filter((k) => !subclassGrantedLeveledKeys.has(k)).length;
  }, [activeLeveledKeys, subclassGrantedLeveledKeys]);

  const freeLeveledLimit = casterMode === 'known'
    ? (limits.spellsKnown ?? 0) - subclassGrantedLeveledKeys.size
    : (limits.spellsPrepared ?? 0) - subclassGrantedLeveledKeys.size;

  const freeCantripLimit = (limits.cantripsKnown ?? 0) - subclassGrantedCantripKeys.size;

  // ── Wizard-specific counters (for at-cap feedback) ────────────────────────
  const freeKnownCount = useMemo(
    () => [...knownKeys].filter((k) => !subclassGrantedLeveledKeys.has(k)).length,
    [knownKeys, subclassGrantedLeveledKeys],
  );
  const freePreparedCount = useMemo(
    () => [...preparedKeys].filter((k) => !subclassGrantedLeveledKeys.has(k)).length,
    [preparedKeys, subclassGrantedLeveledKeys],
  );
  const freeKnownLimit = (limits.wizardSpellbookSize ?? 0) - subclassGrantedLeveledKeys.size;
  const freePreparedLimit = (limits.spellsPrepared ?? 0) - subclassGrantedLeveledKeys.size;

  // ── Toggle handlers ───────────────────────────────────────────────────────

  function toggleCantrip(key: string, checked: boolean) {
    const slug = parseKey(key).slug;
    if (subclassGrantedSet.has(slug)) return; // locked
    if (checked && freeCantripCount >= freeCantripLimit) return; // cap
    setCantripKeys((prev) => toggleSet(prev, key, checked));
    setError(null);
  }

  function toggleLeveled(key: string, checked: boolean) {
    const slug = parseKey(key).slug;
    if (subclassGrantedSet.has(slug)) return; // locked
    if (checked && freeLeveledCount >= freeLeveledLimit) return; // cap
    setActiveLeveledKeys((prev) => toggleSet(prev, key, checked));
    setError(null);
  }

  // ── Wizard-specific toggle handlers (D.2) ────────────────────────────────

  function toggleKnown(key: string, checked: boolean) {
    const slug = parseKey(key).slug;
    if (subclassGrantedSet.has(slug)) return; // locked — skip
    setKnownKeys((prev) => toggleSet(prev, key, checked));
    // Auto-link: unchecking Known → remove from Prepared (prepared ⊆ known)
    if (!checked) {
      setPreparedKeys((prev) => toggleSet(prev, key, false));
    }
    setError(null);
  }

  function togglePrepared(key: string, checked: boolean) {
    const slug = parseKey(key).slug;
    if (subclassGrantedSet.has(slug)) return; // locked — skip
    // Invariant: prepared ⊆ known. Can't prepare a spell not in the spellbook.
    if (checked && !knownKeys.has(key)) return;
    setPreparedKeys((prev) => toggleSet(prev, key, checked));
    setError(null);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validatePicker(): string | null {
    // Cantrips: free picks must equal free cantrip limit
    if (freeCantripLimit > 0 && freeCantripCount !== freeCantripLimit) {
      return `Necesitás elegir ${freeCantripLimit} cantrip${freeCantripLimit !== 1 ? 's' : ''}.`;
    }

    if (casterMode === 'known') {
      const freeLimit = (limits.spellsKnown ?? 0) - subclassGrantedLeveledKeys.size;
      if (freeLimit > 0 && freeLeveledCount !== freeLimit) {
        return `Necesitás elegir ${freeLimit} hechizo${freeLimit !== 1 ? 's' : ''}.`;
      }
    } else if (casterMode === 'prep') {
      const freeLimit = (limits.spellsPrepared ?? 0) - subclassGrantedLeveledKeys.size;
      if (freeLimit > 0 && freeLeveledCount !== freeLimit) {
        return `Necesitás preparar ${freeLimit} hechizo${freeLimit !== 1 ? 's' : ''}.`;
      }
    } else if (casterMode === 'wizard') {
      // D.4 — Full Wizard validation
      // Free known picks: total known minus locked subclass grants
      const freeKnownCount = [...knownKeys].filter((k) => !subclassGrantedLeveledKeys.has(k)).length;
      const minFreeKnown = (limits.wizardSpellbookSize ?? 0) - subclassGrantedLeveledKeys.size;
      if (minFreeKnown > 0 && freeKnownCount < minFreeKnown) {
        return `Necesitás conocer al menos ${minFreeKnown} hechizo${minFreeKnown !== 1 ? 's' : ''} en tu libro.`;
      }

      // Prepared: exact match to spellsPrepared limit
      if (limits.spellsPrepared !== null) {
        const freePreparedCount = [...preparedKeys].filter(
          (k) => !subclassGrantedLeveledKeys.has(k),
        ).length;
        const freePreparedLimit = limits.spellsPrepared - subclassGrantedLeveledKeys.size;
        if (freePreparedLimit > 0 && freePreparedCount !== freePreparedLimit) {
          return `Necesitás preparar exactamente ${freePreparedLimit} hechizo${freePreparedLimit !== 1 ? 's' : ''}.`;
        }
      }

      // Defensive invariant: prepared ⊆ known (should always hold via auto-link)
      for (const k of preparedKeys) {
        if (!knownKeys.has(k)) {
          return 'Tenés hechizos preparados que no están en tu libro. Revisá la selección.';
        }
      }
    }

    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit() {
    const validationError = validatePicker();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    const cantrips = Array.from(cantripKeys).map(parseKey);
    let known: SpellRef[] = [];
    let prepared: SpellRef[] = [];

    if (casterMode === 'known') {
      known = Array.from(knownKeys).map(parseKey);
      prepared = [];
    } else if (casterMode === 'prep') {
      known = [];
      prepared = Array.from(preparedKeys).map(parseKey);
    } else {
      // wizard — Phase D will differentiate; for now treat same as known
      known = Array.from(knownKeys).map(parseKey);
      prepared = Array.from(preparedKeys).map(parseKey);
    }

    startTransition(async () => {
      const res = await saveSpells({ characterId, classSlug, cantrips, known, prepared });
      if (res?.error) setError(res.error);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const headerSummary = useMemo(
    () => buildHeaderSummary(limits, casterMode),
    [limits, casterMode],
  );

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <p className="text-sm font-medium text-ink">{headerSummary}</p>

      {/* Live counters */}
      <div className="flex flex-wrap gap-3 rounded-md border border-line bg-paper-soft px-3 py-2 text-xs">
        {limits.cantripsKnown > 0 && (
          <span
            className={
              freeCantripCount === freeCantripLimit
                ? 'text-primary-deep font-medium'
                : freeCantripCount > freeCantripLimit
                  ? 'text-warning-deep font-medium'
                  : 'text-ink-mute'
            }
          >
            Cantrips: {freeCantripCount}/{freeCantripLimit}
          </span>
        )}
        {casterMode === 'known' && limits.spellsKnown !== null && limits.spellsKnown > 0 && (
          <span
            className={
              freeLeveledCount === freeLeveledLimit
                ? 'text-primary-deep font-medium'
                : freeLeveledCount > freeLeveledLimit
                  ? 'text-warning-deep font-medium'
                  : 'text-ink-mute'
            }
          >
            Conocidos: {freeLeveledCount}/{freeLeveledLimit}
          </span>
        )}
        {casterMode === 'prep' && limits.spellsPrepared !== null && limits.spellsPrepared > 0 && (
          <span
            className={
              freeLeveledCount === freeLeveledLimit
                ? 'text-primary-deep font-medium'
                : freeLeveledCount > freeLeveledLimit
                  ? 'text-warning-deep font-medium'
                  : 'text-ink-mute'
            }
          >
            Preparados: {freeLeveledCount}/{freeLeveledLimit}
          </span>
        )}
        {casterMode === 'wizard' && (
          <>
            <span
              className={
                knownKeys.size >= (limits.wizardSpellbookSize ?? 0)
                  ? 'text-primary-deep font-medium'
                  : 'text-ink-mute'
              }
            >
              Spellbook: {knownKeys.size}/{limits.wizardSpellbookSize} (mín)
            </span>
            {limits.spellsPrepared !== null && (
              <span
                className={
                  preparedKeys.size === limits.spellsPrepared
                    ? 'text-primary-deep font-medium'
                    : preparedKeys.size > limits.spellsPrepared
                      ? 'text-warning-deep font-medium'
                      : 'text-ink-mute'
                }
              >
                Preparados: {preparedKeys.size}/{limits.spellsPrepared}
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Cantrips section ──────────────────────────────────────────────── */}
      {cantripList.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Cantrips
          </p>
          <div className="divide-y divide-line rounded-md border border-line bg-paper">
            {cantripList.map((spell) => {
              const key = spellKey(spell.slug, spell.source);
              const isLocked = subclassGrantedSet.has(spell.slug);
              const checked = cantripKeys.has(key);
              const atCap = !checked && freeCantripLimit > 0 && freeCantripCount >= freeCantripLimit;
              return (
                <SpellRow
                  key={key}
                  spell={spell}
                  checked={checked}
                  locked={isLocked}
                  atCap={atCap}
                  onChange={(c) => toggleCantrip(key, c)}
                />
              );
            })}
          </div>
        </div>
      )}

      {cantripList.length === 0 && limits.cantripsKnown > 0 && (
        <EmptyGroup label="Cantrips" />
      )}

      {/* ── Leveled spells sections ───────────────────────────────────────── */}
      {casterMode === 'wizard' && leveledByLevel.size > 0 && (
        <div className="flex items-center justify-end gap-px pr-3">
          <span className="w-20 text-center text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Conoce
          </span>
          <span className="w-20 text-center text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Prepara
          </span>
        </div>
      )}
      {Array.from(leveledByLevel.entries())
        .sort(([a], [b]) => a - b)
        .map(([lvl, spells]) => (
          <details key={lvl} open>
            <summary className="cursor-pointer list-none">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
                Nivel {lvl}
              </p>
            </summary>
            <div className="divide-y divide-line rounded-md border border-line bg-paper">
              {spells.map((spell) => {
                const key = spellKey(spell.slug, spell.source);
                const isLocked = subclassGrantedSet.has(spell.slug);
                if (casterMode === 'wizard') {
                  const knownChecked = knownKeys.has(key);
                  const preparedChecked = preparedKeys.has(key);
                  const knownAtCap =
                    !knownChecked && freeKnownLimit > 0 && freeKnownCount >= freeKnownLimit;
                  const preparedAtCap =
                    !preparedChecked &&
                    (!knownChecked ||
                      (freePreparedLimit > 0 && freePreparedCount >= freePreparedLimit));
                  return (
                    <WizardSpellRow
                      key={key}
                      spell={spell}
                      knownChecked={knownChecked}
                      preparedChecked={preparedChecked}
                      locked={isLocked}
                      knownAtCap={knownAtCap}
                      preparedAtCap={preparedAtCap}
                      onToggleKnown={(c) => toggleKnown(key, c)}
                      onTogglePrepared={(c) => togglePrepared(key, c)}
                    />
                  );
                }
                const checked = activeLeveledKeys.has(key);
                const atCap = !checked && freeLeveledLimit > 0 && freeLeveledCount >= freeLeveledLimit;
                return (
                  <SpellRow
                    key={key}
                    spell={spell}
                    checked={checked}
                    locked={isLocked}
                    atCap={atCap}
                    onChange={(c) => toggleLeveled(key, c)}
                  />
                );
              })}
            </div>
          </details>
        ))}

      {leveledByLevel.size === 0 && limits.maxSpellLevel > 0 && (
        <EmptyGroup label={`Nivel 1`} />
      )}

      <WizardFooterNav
        backHref={`/characters/${characterId}/wizard/background`}
        onNext={handleSubmit}
        pending={pending}
        error={error}
      />
    </div>
  );
}

// ── SpellRow ───────────────────────────────────────────────────────────────

function SpellRow({
  spell,
  checked,
  locked,
  atCap = false,
  onChange,
}: {
  spell: AvailableSpell;
  checked: boolean;
  locked: boolean;
  atCap?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const interactive = !locked && !atCap;
  return (
    <label
      className={[
        'flex items-center gap-3 px-3 py-2.5 transition',
        interactive ? 'cursor-pointer hover:bg-paper-soft' : 'cursor-not-allowed',
        locked ? 'opacity-80' : '',
        atCap ? 'opacity-40' : '',
        checked && !locked ? 'bg-accent-soft/30' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={atCap ? 'Llegaste al límite. Desmarcá uno para elegir otro.' : undefined}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        disabled={locked || atCap}
        onChange={(e) => interactive && onChange(e.target.checked)}
        aria-label={`Elegir ${spell.name}`}
        className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />

      {/* Spell info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-ink">{spell.name}</span>
          <span className="text-xs text-ink-mute">{decodeSchool(spell.school)}</span>
          {spell.ritual && (
            <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Ritual">
              R
            </span>
          )}
          {spell.concentration && (
            <span className="rounded bg-blue-100 px-1 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" title="Concentración">
              C
            </span>
          )}
          {spell.componentsM && (
            <span className="rounded bg-purple-100 px-1 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" title="Componente material">
              M
            </span>
          )}
          {locked && (
            <Pill tone="pink" size="sm">
              Subclase
            </Pill>
          )}
        </div>
      </div>
    </label>
  );
}

// ── WizardSpellRow ─────────────────────────────────────────────────────────
// Two-column row (Conoce / Prepara) for the Wizard picker variant (D.1).

function WizardSpellRow({
  spell,
  knownChecked,
  preparedChecked,
  locked,
  knownAtCap = false,
  preparedAtCap = false,
  onToggleKnown,
  onTogglePrepared,
}: {
  spell: AvailableSpell;
  knownChecked: boolean;
  preparedChecked: boolean;
  locked: boolean;
  knownAtCap?: boolean;
  preparedAtCap?: boolean;
  onToggleKnown: (checked: boolean) => void;
  onTogglePrepared: (checked: boolean) => void;
}) {
  // Row dims when BOTH columns are at cap and unchecked — gives a clear "no
  // puedo tocar nada acá" signal. Locked subclass rows stay slightly opaque.
  const bothCapped = knownAtCap && preparedAtCap;
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-2.5 transition',
        locked ? 'opacity-80' : 'hover:bg-paper-soft',
        bothCapped ? 'opacity-40' : '',
        knownChecked && !locked ? 'bg-accent-soft/30' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Spell info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-ink">{spell.name}</span>
          <span className="text-xs text-ink-mute">{decodeSchool(spell.school)}</span>
          {spell.ritual && (
            <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Ritual">
              R
            </span>
          )}
          {spell.concentration && (
            <span className="rounded bg-blue-100 px-1 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" title="Concentración">
              C
            </span>
          )}
          {spell.componentsM && (
            <span className="rounded bg-purple-100 px-1 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" title="Componente material">
              M
            </span>
          )}
          {locked && (
            <Pill tone="pink" size="sm">
              Subclase
            </Pill>
          )}
        </div>
      </div>

      {/* Conoce checkbox */}
      <label
        className={[
          'flex w-20 items-center justify-center',
          locked || knownAtCap ? 'cursor-not-allowed' : 'cursor-pointer',
          knownAtCap && !knownChecked ? 'opacity-40' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={knownAtCap ? 'Llegaste al límite del libro. Desmarcá un conocido para elegir otro.' : undefined}
      >
        <input
          type="checkbox"
          checked={knownChecked}
          disabled={locked || knownAtCap}
          onChange={(e) => !locked && !knownAtCap && onToggleKnown(e.target.checked)}
          aria-label={`Conocer ${spell.name}`}
          className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
        />
      </label>

      {/* Prepara checkbox */}
      <label
        className={[
          'flex w-20 items-center justify-center',
          locked || preparedAtCap ? 'cursor-not-allowed' : 'cursor-pointer',
          preparedAtCap && !preparedChecked ? 'opacity-40' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={preparedAtCap ? 'Llegaste al límite de preparados. Desmarcá uno para preparar otro.' : undefined}
      >
        <input
          type="checkbox"
          checked={preparedChecked}
          disabled={locked || preparedAtCap}
          onChange={(e) => !locked && !preparedAtCap && onTogglePrepared(e.target.checked)}
          aria-label={`Preparar ${spell.name}`}
          className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
        />
      </label>
    </div>
  );
}

// ── EmptyGroup ─────────────────────────────────────────────────────────────

function EmptyGroup({ label }: { label: string }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{label}</p>
      <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-xs text-ink-mute">
        Sin resultados
      </div>
    </div>
  );
}
