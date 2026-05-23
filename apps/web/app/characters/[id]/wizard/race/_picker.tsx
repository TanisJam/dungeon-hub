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
  type AbilityKey,
  type AsiSlot,
  type RaceData,
} from './_parsers';
import { saveRace } from './actions';
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
  initialSelection,
  initialChosenAsis = {},
  initialLanguageChoices = [],
}: {
  characterId: string;
  entries: RaceEntry[];
  initialSelection: Selection | null;
  initialChosenAsis?: Record<string, AbilityKey[]>;
  initialLanguageChoices?: string[];
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

    startTransition(async () => {
      const res = await saveRace(
        characterId,
        racePart,
        subracePart,
        appliedAsis,
        chosenLangs,
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

    // Tag pills: ASI summary, size, speed
    const pills: ChoiceOption<string>['pills'] = [];
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
  chosenAsis,
  setChosenAsis,
  chosenLangs,
  setChosenLangs,
}: {
  entry: RaceEntry;
  parent: RaceEntry | null;
  chosenAsis: Record<string, AbilityKey[]>;
  setChosenAsis: (next: Record<string, AbilityKey[]>) => void;
  chosenLangs: string[];
  setChosenLangs: (next: string[]) => void;
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

  return (
    <div className="space-y-3">
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
