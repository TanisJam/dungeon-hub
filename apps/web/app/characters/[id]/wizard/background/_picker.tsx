'use client';

import { useMemo, useState, useTransition } from 'react';
import { parseBackground, type BackgroundData, type ParsedBackground } from './_parsers';
import { poolFor, titleCase } from './_options';
import { saveBackground } from './actions';

export type BackgroundEntry = {
  slug: string;
  source: string;
  name: string;
  data: BackgroundData;
};

type Initial = {
  slug: string;
  source: string;
  skillChoices: string[];
  languageChoices: string[];
  toolChoices: Record<string, string[]>;
};

function entryKey(e: { slug: string; source: string }): string {
  return `${e.slug}|${e.source}`;
}

const LANG_CHOOSE_KEYS = ['anyStandard', 'anyExotic', 'any'] as const;
const TOOL_CHOOSE_KEYS = [
  'anyGamingSet',
  'anyArtisansTool',
  'anyMusicalInstrument',
  'any',
] as const;

const KIND_LABEL: Record<string, string> = {
  anyStandard: 'Standard language',
  anyExotic: 'Exotic language',
  any: 'Any',
  anyGamingSet: 'Gaming set',
  anyArtisansTool: "Artisan's tool",
  anyMusicalInstrument: 'Musical instrument',
};

export function BackgroundPicker({
  characterId,
  entries,
  initialSelection,
  lockedSkills = [],
}: {
  characterId: string;
  entries: BackgroundEntry[];
  initialSelection: Initial | null;
  lockedSkills?: string[];
}) {
  const lockedSet = new Set(lockedSkills.map((s) => s.toLowerCase()));
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialSelection ? `${initialSelection.slug}|${initialSelection.source}` : null,
  );
  const [skills, setSkills] = useState<string[]>(initialSelection?.skillChoices ?? []);
  const [langs, setLangs] = useState<string[]>(initialSelection?.languageChoices ?? []);
  const [tools, setTools] = useState<Record<string, string[]>>(
    initialSelection?.toolChoices ?? {},
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
  const parsed = useMemo(() => (selected ? parseBackground(selected.data) : null), [selected]);

  function reset() {
    setSkills([]);
    setLangs([]);
    setTools({});
    setError(null);
  }

  function toggleSkill(skill: string) {
    if (!parsed?.skillChoose) return;
    if (lockedSet.has(skill.toLowerCase())) return;
    const has = skills.includes(skill);
    if (has) setSkills(skills.filter((s) => s !== skill));
    else if (skills.length >= parsed.skillChoose.count) return;
    else setSkills([...skills, skill]);
  }

  function setLangsForKind(kind: string, vals: string[]) {
    // En vez de hold per-kind, mantenemos un array plano. El kind solo dicta el pool.
    // Mantenemos los seleccionados de OTROS kinds + los nuevos.
    const otherSelected = langs.filter((l) => !poolFor(kind).includes(l));
    setLangs([...otherSelected, ...vals]);
  }

  function getLangsForKind(kind: string): string[] {
    return langs.filter((l) => poolFor(kind).includes(l));
  }

  function setToolsForKind(kind: string, vals: string[]) {
    setTools({ ...tools, [kind]: vals });
  }

  function handleContinue() {
    if (!selected || !parsed) {
      setError('Pick a background first.');
      return;
    }
    setError(null);

    // Validar skill count
    if (parsed.skillChoose && skills.length !== parsed.skillChoose.count) {
      setError(`Pick ${parsed.skillChoose.count} skill${parsed.skillChoose.count > 1 ? 's' : ''}.`);
      return;
    }

    // Validar language counts
    for (const [kind, count] of Object.entries(parsed.languageChooseCounts)) {
      const got = getLangsForKind(kind).length;
      if (got !== count) {
        setError(`Pick ${count} ${KIND_LABEL[kind] ?? kind}${count > 1 ? 's' : ''}.`);
        return;
      }
    }

    // Validar tool counts
    for (const [kind, count] of Object.entries(parsed.toolChooseCounts)) {
      const got = (tools[kind] ?? []).length;
      if (got !== count) {
        setError(`Pick ${count} ${KIND_LABEL[kind] ?? kind}${count > 1 ? 's' : ''}.`);
        return;
      }
    }

    startTransition(async () => {
      const res = await saveBackground(
        characterId,
        { slug: selected.slug, source: selected.source },
        skills,
        langs,
        tools,
      );
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr,1.3fr]">
      <div>
        <input
          type="search"
          placeholder="Search backgrounds…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {filtered.map((e) => {
            const key = entryKey(e);
            const isSelected = key === selectedKey;
            const p = parseBackground(e.data);
            const skillSummary = [
              ...p.fixedSkills.map(titleCase),
              p.skillChoose && `+${p.skillChoose.count} choice`,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKey(key);
                    if (key !== selectedKey) reset();
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
                  <p className="mt-0.5 text-xs text-zinc-500">{skillSummary || '—'}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        {!selected || !parsed ? (
          <p className="text-sm text-zinc-500">Pick a background to see its details.</p>
        ) : (
          <BackgroundDetailPanel
            entry={selected}
            parsed={parsed}
            skills={skills}
            toggleSkill={toggleSkill}
            getLangsForKind={getLangsForKind}
            setLangsForKind={setLangsForKind}
            tools={tools}
            setToolsForKind={setToolsForKind}
            lockedSkills={lockedSet}
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

function BackgroundDetailPanel({
  entry,
  parsed,
  skills,
  toggleSkill,
  getLangsForKind,
  setLangsForKind,
  tools,
  setToolsForKind,
  lockedSkills,
}: {
  entry: BackgroundEntry;
  parsed: ParsedBackground;
  skills: string[];
  toggleSkill: (s: string) => void;
  getLangsForKind: (k: string) => string[];
  setLangsForKind: (k: string, vals: string[]) => void;
  tools: Record<string, string[]>;
  setToolsForKind: (k: string, vals: string[]) => void;
  lockedSkills: Set<string>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{entry.name}</h3>
        <p className="mt-0.5 text-xs text-zinc-500">{entry.source}</p>
      </div>

      {/* Skills */}
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Skills</p>
        {parsed.fixedSkills.length > 0 && (
          <p className="mt-1 text-sm">
            <span className="text-zinc-500">Granted:</span>{' '}
            {parsed.fixedSkills.map(titleCase).join(', ')}
          </p>
        )}
        {parsed.skillChoose && (
          <ChooseGroup
            label={`Pick ${parsed.skillChoose.count}`}
            pool={parsed.skillChoose.from}
            selected={skills}
            count={parsed.skillChoose.count}
            onToggle={toggleSkill}
            lockedSkills={lockedSkills}
          />
        )}
      </div>

      {/* Languages */}
      {(parsed.fixedLanguages.length > 0 || Object.keys(parsed.languageChooseCounts).length > 0) && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Languages</p>
          {parsed.fixedLanguages.length > 0 && (
            <p className="mt-1 text-sm">
              <span className="text-zinc-500">Granted:</span>{' '}
              {parsed.fixedLanguages.map(titleCase).join(', ')}
            </p>
          )}
          {LANG_CHOOSE_KEYS.map((kind) => {
            const count = parsed.languageChooseCounts[kind];
            if (!count) return null;
            const sel = getLangsForKind(kind);
            return (
              <MultiSelectChoose
                key={kind}
                label={`Pick ${count} ${KIND_LABEL[kind].toLowerCase()}${count > 1 ? 's' : ''}`}
                pool={poolFor(kind)}
                selected={sel}
                count={count}
                onChange={(vals) => setLangsForKind(kind, vals)}
              />
            );
          })}
        </div>
      )}

      {/* Tools */}
      {(parsed.fixedTools.length > 0 || Object.keys(parsed.toolChooseCounts).length > 0) && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Tools</p>
          {parsed.fixedTools.length > 0 && (
            <p className="mt-1 text-sm">
              <span className="text-zinc-500">Granted:</span>{' '}
              {parsed.fixedTools.map(titleCase).join(', ')}
            </p>
          )}
          {TOOL_CHOOSE_KEYS.map((kind) => {
            const count = parsed.toolChooseCounts[kind];
            if (!count) return null;
            const sel = tools[kind] ?? [];
            return (
              <MultiSelectChoose
                key={kind}
                label={`Pick ${count} ${KIND_LABEL[kind].toLowerCase()}${count > 1 ? 's' : ''}`}
                pool={poolFor(kind)}
                selected={sel}
                count={count}
                onChange={(vals) => setToolsForKind(kind, vals)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChooseGroup({
  label,
  pool,
  selected,
  count,
  onToggle,
  lockedSkills,
}: {
  label: string;
  pool: string[];
  selected: string[];
  count: number;
  onToggle: (v: string) => void;
  lockedSkills?: Set<string>;
}) {
  const hasLocked = lockedSkills && Array.from(lockedSkills).some((s) => pool.includes(s));
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs text-amber-300">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pool.map((s) => {
          const isOn = selected.includes(s);
          const isLocked = lockedSkills?.has(s.toLowerCase()) ?? false;
          const disabled = isLocked || (!isOn && selected.length >= count);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onToggle(s)}
              disabled={disabled}
              title={isLocked ? 'Already given by your class' : undefined}
              className={`rounded px-2 py-1 text-xs ring-1 ring-inset transition ${
                isLocked
                  ? 'bg-zinc-800/50 text-zinc-600 ring-zinc-800 line-through cursor-not-allowed'
                  : isOn
                    ? 'bg-amber-500/20 text-amber-200 ring-amber-500/50'
                    : 'text-zinc-400 ring-zinc-700 hover:ring-zinc-500 disabled:opacity-30'
              }`}
            >
              {titleCase(s)}
            </button>
          );
        })}
      </div>
      {hasLocked && (
        <p className="mt-2 text-xs text-zinc-500">
          Struck-through skills are already given by your class.
        </p>
      )}
    </div>
  );
}

function MultiSelectChoose({
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
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs text-amber-300">{label}</p>
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
              className={`rounded px-2 py-1 text-xs ring-1 ring-inset transition ${
                isOn
                  ? 'bg-amber-500/20 text-amber-200 ring-amber-500/50'
                  : 'text-zinc-400 ring-zinc-700 hover:ring-zinc-500 disabled:opacity-30'
              }`}
            >
              {titleCase(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
