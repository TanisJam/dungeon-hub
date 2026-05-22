'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  ABILITY_KEYS,
  formatAsisSummary,
  formatLanguages,
  formatSize,
  formatSpeed,
  extractTraits,
  parseAsis,
  type AbilityKey,
  type AsiSlot,
  type RaceData,
} from './_parsers';
import { saveRace } from './actions';

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

// La key UI única para una entry (cada subrace y cada parent es pickeable).
function entryKey(e: { slug: string; source: string }): string {
  return `${e.slug}|${e.source}`;
}

export function RacePicker({
  characterId,
  entries,
  initialSelection,
  initialChosenAsis = {},
}: {
  characterId: string;
  entries: RaceEntry[];
  initialSelection: Selection | null;
  initialChosenAsis?: Record<string, AbilityKey[]>;
}) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (!initialSelection) return null;
    const k = initialSelection.subraceSlug
      ? `${initialSelection.subraceSlug}|${initialSelection.subraceSource}`
      : `${initialSelection.raceSlug}|${initialSelection.raceSource}`;
    return k;
  });
  const [chosenAsis, setChosenAsis] = useState<Record<string, AbilityKey[]>>(initialChosenAsis);
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
      setError('Pick a race first.');
      return;
    }
    setError(null);

    const racePart = selected.isSubrace && parent
      ? { slug: parent.slug, source: parent.source }
      : { slug: selected.slug, source: selected.source };
    const subracePart =
      selected.isSubrace ? { slug: selected.slug, source: selected.source } : null;

    // Expand ASIs: fixed + choose (filled by user).
    const appliedAsis: Array<{ ability: AbilityKey; bonus: number; source: 'race' | 'subrace' }> = [];
    const collect = (data: RaceData, source: 'race' | 'subrace') => {
      const slots = parseAsis(data.ability);
      slots.forEach((slot, idx) => {
        if (slot.kind === 'fixed') {
          appliedAsis.push({ ability: slot.ability, bonus: slot.bonus, source });
        } else {
          const chosen = chosenAsis[`${source}:${idx}`] ?? [];
          if (chosen.length !== slot.count) {
            setError(`Pick exactly ${slot.count} ability${slot.count > 1 ? ' choices' : ''}.`);
            throw new Error('asi-incomplete');
          }
          for (const a of chosen) {
            appliedAsis.push({ ability: a, bonus: slot.amount, source });
          }
        }
      });
    };

    try {
      if (parent) collect(parent.data, 'race');
      if (selected.isSubrace) collect(selected.data, 'subrace');
      else collect(selected.data, 'race');
    } catch {
      return; // setError ya hizo lo suyo
    }

    startTransition(async () => {
      const res = await saveRace(characterId, racePart, subracePart, appliedAsis);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr,1.3fr]">
      <div>
        <input
          type="search"
          placeholder="Search races…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {filtered.map((e) => {
            const key = entryKey(e);
            const isSelected = key === selectedKey;
            const asis = parseAsis(e.data.ability);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKey(key);
                    setChosenAsis({});
                    setError(null);
                  }}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{displayName(e, entries)}</p>
                    <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                      {e.source}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{formatAsisSummary(asis)}</p>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-md border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-500">
              No matches.
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        {!selected ? (
          <p className="text-sm text-zinc-500">Pick a race to see its details.</p>
        ) : (
          <RaceDetailPanel
            entry={selected}
            parent={parent}
            chosenAsis={chosenAsis}
            setChosenAsis={setChosenAsis}
          />
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleContinue}
            disabled={pending || !selected}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            {pending ? 'Saving…' : 'Save & continue →'}
          </button>
        </div>
      </div>
    </div>
  );
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

// ---------------------------------------------------------------------------

function RaceDetailPanel({
  entry,
  parent,
  chosenAsis,
  setChosenAsis,
}: {
  entry: RaceEntry;
  parent: RaceEntry | null;
  chosenAsis: Record<string, AbilityKey[]>;
  setChosenAsis: (next: Record<string, AbilityKey[]>) => void;
}) {
  const traits = useMemo(() => {
    const own = extractTraits(entry.data.entries);
    if (!parent) return own;
    return [...extractTraits(parent.data.entries), ...own];
  }, [entry, parent]);

  const langs = formatLanguages(entry.data.languageProficiencies);
  const size = formatSize(entry.data.size);
  const speed = formatSpeed(entry.data.speed);

  return (
    <div>
      <h3 className="text-base font-semibold">
        {entry.isSubrace && parent ? `${entry.name} ${parent.name}` : entry.name}
      </h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        {size} · Speed {speed} · {entry.source}
      </p>

      {parent && (
        <AsiBlock data={parent.data} source="race" chosen={chosenAsis} setChosen={setChosenAsis} />
      )}
      <AsiBlock
        data={entry.data}
        source={entry.isSubrace ? 'subrace' : 'race'}
        chosen={chosenAsis}
        setChosen={setChosenAsis}
      />

      {langs && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Languages</p>
          <p className="mt-1 text-sm">{langs}</p>
        </div>
      )}

      {traits.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Traits</p>
          <ul className="mt-2 space-y-2 text-sm">
            {traits.map((t, i) => (
              <li key={i}>
                <span className="font-medium">{t.name}.</span>{' '}
                <span className="text-zinc-300">{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AsiBlock({
  data,
  source,
  chosen,
  setChosen,
}: {
  data: RaceData;
  source: 'race' | 'subrace';
  chosen: Record<string, AbilityKey[]>;
  setChosen: (next: Record<string, AbilityKey[]>) => void;
}) {
  const slots = parseAsis(data.ability);
  if (slots.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">
        Ability Score Increase {source === 'subrace' && '(subrace)'}
      </p>
      <div className="mt-2 space-y-2">
        {slots.map((slot, idx) => {
          if (slot.kind === 'fixed') {
            const sign = slot.bonus >= 0 ? '+' : '';
            return (
              <p key={idx} className="text-sm">
                <span className="font-mono">
                  {sign}
                  {slot.bonus} {slot.ability.toUpperCase()}
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
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs text-amber-300">
        Choose {slot.count} ability{slot.count > 1 ? ' scores' : ''} to get +{slot.amount}:
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
              className={`rounded px-2 py-1 text-xs font-mono ring-1 ring-inset transition ${
                isOn
                  ? 'bg-amber-500/20 text-amber-200 ring-amber-500/50'
                  : 'text-zinc-400 ring-zinc-700 hover:ring-zinc-500 disabled:opacity-30'
              }`}
            >
              {a.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
