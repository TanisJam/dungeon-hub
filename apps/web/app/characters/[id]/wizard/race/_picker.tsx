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
import { requiresSubrace } from '@dungeon-hub/domain/character/race';
import { poolFor, titleCase } from '../background/_options';
import { ChoiceList } from '@/components/wizard/choice-list';
import type { ChoiceOption } from '@/components/wizard/choice-list';
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const display = displayName(e, entries).toLowerCase();
      return display.includes(q) || e.source.toLowerCase().includes(q);
    });
  }, [entries, query]);

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

  // Build ChoiceList options
  const options: ChoiceOption<string>[] = filtered.map((e) => {
    const key = entryKey(e);
    const asis = parseAsis(e.data.ability);
    const asiSummary = formatAsisSummary(asis);
    const speedStr = formatSpeed(e.data.speed);
    const sizeStr = formatSize(e.data.size);

    // Tag pills: subrace-required indicator, ASI summary, size, speed
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
  });

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

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-xs text-ink-mute">
          Sin resultados.
        </div>
      ) : (
        <ChoiceList
          options={options}
          selectedKey={selectedKey}
          onSelect={(key) => {
            if (key !== selectedKey) {
              setChosenAsis({});
              setChosenLangs([]);
              setChosenSkills([]);
              setChosenFeatSlug(null);
              setChosenCantrip(null);
            }
            setSelectedKey(key);
            setError(null);
          }}
        />
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
