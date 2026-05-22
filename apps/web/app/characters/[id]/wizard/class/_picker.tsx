'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  formatHitDie,
  formatPrimary,
  formatProfs,
  formatSaves,
  getSkillChoice,
  requiresL1Subclass,
  titleCase,
  type ClassData,
} from './_parsers';
import { saveClass } from './actions';

export type ClassEntry = {
  slug: string;
  source: string;
  name: string;
  data: ClassData;
};

export type SubclassRow = {
  id: string;
  slug: string;
  source: string;
  name: string;
  classSlug: string;
  classSource: string;
};

type Initial = {
  slug: string;
  source: string;
  skillChoices: string[];
  subclass: { slug: string; source: string } | null;
};

function entryKey(e: { slug: string; source: string }): string {
  return `${e.slug}|${e.source}`;
}

export function ClassPicker({
  characterId,
  entries,
  subclassesByClass,
  initialSelection,
  lockedSkills = [],
}: {
  characterId: string;
  entries: ClassEntry[];
  subclassesByClass: Record<string, SubclassRow[]>;
  initialSelection: Initial | null;
  lockedSkills?: string[];
}) {
  const lockedSet = new Set(lockedSkills.map((s) => s.toLowerCase()));
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialSelection ? `${initialSelection.slug}|${initialSelection.source}` : null,
  );
  const [skills, setSkills] = useState<string[]>(initialSelection?.skillChoices ?? []);
  const [subclassKey, setSubclassKey] = useState<string | null>(
    initialSelection?.subclass
      ? `${initialSelection.subclass.slug}|${initialSelection.subclass.source}`
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.source.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const selected = useMemo(
    () => entries.find((e) => entryKey(e) === selectedKey) ?? null,
    [entries, selectedKey],
  );

  const skillChoice = useMemo(
    () => (selected ? getSkillChoice(selected.data) : null),
    [selected],
  );

  const needsSubclass = useMemo(
    () => (selected ? requiresL1Subclass(selected.data) : false),
    [selected],
  );

  const subclassOptions: SubclassRow[] = useMemo(() => {
    if (!selected || !needsSubclass) return [];
    return subclassesByClass[`${selected.slug}|${selected.source}`] ?? [];
  }, [selected, needsSubclass, subclassesByClass]);

  function toggleSkill(skill: string) {
    if (!skillChoice) return;
    if (lockedSet.has(skill.toLowerCase())) return;
    const has = skills.includes(skill);
    if (has) setSkills(skills.filter((s) => s !== skill));
    else if (skills.length >= skillChoice.count) return;
    else setSkills([...skills, skill]);
  }

  function handleContinue() {
    if (!selected) {
      setError('Pick a class first.');
      return;
    }
    if (skillChoice && skills.length !== skillChoice.count) {
      setError(`Pick exactly ${skillChoice.count} skills.`);
      return;
    }
    if (needsSubclass && !subclassKey) {
      setError(`Pick a ${selected.data.subclassTitle ?? 'subclass'}.`);
      return;
    }
    setError(null);

    const subclass = subclassKey
      ? (() => {
          const [slug, source] = subclassKey.split('|');
          return slug && source ? { slug, source } : null;
        })()
      : null;

    startTransition(async () => {
      const res = await saveClass(
        characterId,
        { slug: selected.slug, source: selected.source },
        1,
        skills,
        subclass,
      );
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr,1.3fr]">
      <div>
        <input
          type="search"
          placeholder="Search classes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {filtered.map((e) => {
            const key = entryKey(e);
            const isSelected = key === selectedKey;
            const hd = formatHitDie(e.data.hd);
            const primary = formatPrimary(e.data.primaryAbility);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKey(key);
                    // reset skills + subclass if changing class
                    if (key !== selectedKey) {
                      setSkills([]);
                      setSubclassKey(null);
                    }
                    setError(null);
                  }}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                      {e.source}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Hit {hd}
                    {primary && ` · Primary ${primary}`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        {!selected ? (
          <p className="text-sm text-zinc-500">Pick a class to see its details.</p>
        ) : (
          <>
            <ClassDetailPanel
              entry={selected}
              skillChoice={skillChoice}
              selectedSkills={skills}
              toggleSkill={toggleSkill}
              lockedSkills={lockedSet}
            />
            {needsSubclass && (
              <SubclassPicker
                title={selected.data.subclassTitle ?? 'Subclass'}
                options={subclassOptions}
                selectedKey={subclassKey}
                onSelect={(k) => {
                  setSubclassKey(k);
                  setError(null);
                }}
              />
            )}
          </>
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

function ClassDetailPanel({
  entry,
  skillChoice,
  selectedSkills,
  toggleSkill,
  lockedSkills,
}: {
  entry: ClassEntry;
  skillChoice: ReturnType<typeof getSkillChoice>;
  selectedSkills: string[];
  toggleSkill: (s: string) => void;
  lockedSkills: Set<string>;
}) {
  const d = entry.data;
  return (
    <div>
      <h3 className="text-base font-semibold">{entry.name}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        Hit Die {formatHitDie(d.hd)} · Saves {formatSaves(d.proficiency)}
        {formatPrimary(d.primaryAbility) && ` · Primary ${formatPrimary(d.primaryAbility)}`} · {entry.source}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Prof label="Armor" value={formatProfs(d.startingProficiencies?.armor)} />
        <Prof label="Weapons" value={formatProfs(d.startingProficiencies?.weapons)} />
        <Prof label="Tools" value={formatProfs(d.startingProficiencies?.tools)} />
      </div>

      {skillChoice && (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Skills — pick {skillChoice.count}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skillChoice.from.map((s) => {
              const isOn = selectedSkills.includes(s);
              const isLocked = lockedSkills.has(s.toLowerCase());
              const disabled = isLocked || (!isOn && selectedSkills.length >= skillChoice.count);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSkill(s)}
                  disabled={disabled}
                  title={isLocked ? 'Already granted by your background' : undefined}
                  className={`rounded px-2 py-1 text-xs ring-1 ring-inset transition ${
                    isLocked
                      ? 'bg-zinc-800/50 text-zinc-600 ring-zinc-800 line-through cursor-not-allowed'
                      : isOn
                        ? 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/50'
                        : 'text-zinc-400 ring-zinc-700 hover:ring-zinc-500 disabled:opacity-30'
                  }`}
                >
                  {titleCase(s)}
                </button>
              );
            })}
          </div>
          {lockedSkills.size > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              Struck-through skills are already given by your background.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SubclassPicker({
  title,
  options,
  selectedKey,
  onSelect,
}: {
  title: string;
  options: SubclassRow[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="mt-5 rounded-md border border-red-500/30 bg-red-500/5 p-3">
        <p className="text-xs text-red-300">
          {title} required at L1, but no options found in the compendium.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{title} — pick 1</p>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {options.map((sc) => {
          const k = `${sc.slug}|${sc.source}`;
          const isOn = k === selectedKey;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(isOn ? null : k)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                isOn
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{sc.name}</span>
                <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                  {sc.source}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Prof({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-zinc-300">{value}</p>
    </div>
  );
}
