'use client';

import { useMemo, useState, useTransition } from 'react';
import { parseBackground, type BackgroundData, type ParsedBackground } from './_parsers';
import { poolFor, titleCase } from './_options';
import { saveBackground } from './actions';
import { ChoiceList } from '@/components/wizard/choice-list';
import type { ChoiceOption } from '@/components/wizard/choice-list';
import { Button } from '@/components/ui';

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
  anyStandard: 'Idioma estándar',
  anyExotic: 'Idioma exótico',
  any: 'Cualquiera',
  anyGamingSet: 'Juego de azar',
  anyArtisansTool: 'Herramienta de artesano',
  anyMusicalInstrument: 'Instrumento musical',
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
      setError('Elegí un trasfondo primero.');
      return;
    }
    setError(null);

    if (parsed.skillChoose && skills.length !== parsed.skillChoose.count) {
      setError(`Elegí ${parsed.skillChoose.count} habilidad${parsed.skillChoose.count > 1 ? 'es' : ''}.`);
      return;
    }

    for (const [kind, count] of Object.entries(parsed.languageChooseCounts)) {
      const got = getLangsForKind(kind).length;
      if (got !== count) {
        setError(`Elegí ${count} ${KIND_LABEL[kind] ?? kind}${count > 1 ? 's' : ''}.`);
        return;
      }
    }

    for (const [kind, count] of Object.entries(parsed.toolChooseCounts)) {
      const got = (tools[kind] ?? []).length;
      if (got !== count) {
        setError(`Elegí ${count} ${KIND_LABEL[kind] ?? kind}${count > 1 ? 's' : ''}.`);
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

  // Build ChoiceList options
  const options: ChoiceOption<string>[] = filtered.map((e) => {
    const key = entryKey(e);
    const p = parseBackground(e.data);
    const skillSummary = [
      ...p.fixedSkills.map(titleCase),
      p.skillChoose && `+${p.skillChoose.count} elección`,
    ]
      .filter(Boolean)
      .join(', ');

    const isThisSelected = key === selectedKey;
    const currentParsed = isThisSelected ? parsed : p;

    return {
      key,
      title: e.name,
      sub: skillSummary || undefined,
      metaPills: [{ tone: 'stone' as const, label: e.source }],
      detail: currentParsed ? (
        <BackgroundDetailInline
          entry={e}
          parsed={currentParsed}
          skills={isThisSelected ? skills : []}
          toggleSkill={toggleSkill}
          getLangsForKind={getLangsForKind}
          setLangsForKind={setLangsForKind}
          tools={isThisSelected ? tools : {}}
          setToolsForKind={setToolsForKind}
          lockedSkills={lockedSet}
        />
      ) : null,
    };
  });

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Buscar trasfondo…"
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
            if (key !== selectedKey) reset();
            setSelectedKey(key);
          }}
        />
      )}

      {error && <p className="text-sm text-warning-deep">{error}</p>}

      <Button
        tone="green"
        size="md"
        onClick={handleContinue}
        disabled={pending || !selected}
        className="w-full"
      >
        {pending ? 'Guardando…' : 'Guardar y seguir →'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background detail inline
// ---------------------------------------------------------------------------

function BackgroundDetailInline({
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
    <div className="space-y-3">
      <p className="text-[10px] text-ink-mute">{entry.source}</p>

      {/* Skills */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Habilidades</p>
        {parsed.fixedSkills.length > 0 && (
          <p className="mt-1 text-xs">
            <span className="text-ink-mute">Otorgadas:</span>{' '}
            <span className="text-ink">{parsed.fixedSkills.map(titleCase).join(', ')}</span>
          </p>
        )}
        {parsed.skillChoose && (
          <ChooseGroup
            label={`Elegí ${parsed.skillChoose.count}`}
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
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Idiomas</p>
          {parsed.fixedLanguages.length > 0 && (
            <p className="mt-1 text-xs">
              <span className="text-ink-mute">Otorgados:</span>{' '}
              <span className="text-ink">{parsed.fixedLanguages.map(titleCase).join(', ')}</span>
            </p>
          )}
          {LANG_CHOOSE_KEYS.map((kind) => {
            const count = parsed.languageChooseCounts[kind];
            if (!count) return null;
            const sel = getLangsForKind(kind);
            return (
              <MultiSelectChoose
                key={kind}
                label={`Elegí ${count} ${KIND_LABEL[kind].toLowerCase()}${count > 1 ? 's' : ''}`}
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
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Herramientas</p>
          {parsed.fixedTools.length > 0 && (
            <p className="mt-1 text-xs">
              <span className="text-ink-mute">Otorgadas:</span>{' '}
              <span className="text-ink">{parsed.fixedTools.map(titleCase).join(', ')}</span>
            </p>
          )}
          {TOOL_CHOOSE_KEYS.map((kind) => {
            const count = parsed.toolChooseCounts[kind];
            if (!count) return null;
            const sel = tools[kind] ?? [];
            return (
              <MultiSelectChoose
                key={kind}
                label={`Elegí ${count} ${KIND_LABEL[kind].toLowerCase()}${count > 1 ? 's' : ''}`}
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
    <div className="mt-2 rounded-md border border-accent-soft bg-paper p-2.5">
      <p className="text-[10px] font-semibold text-accent-deep">{label}</p>
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
              title={isLocked ? 'Ya otorgada por tu clase' : undefined}
              className={[
                'rounded px-2 py-1 text-xs ring-1 ring-inset transition',
                isLocked
                  ? 'bg-paper-soft text-ink-mute ring-line line-through cursor-not-allowed'
                  : isOn
                    ? 'bg-accent-soft text-accent-deep ring-accent'
                    : 'text-ink-soft ring-line hover:ring-accent-soft disabled:opacity-30',
              ].join(' ')}
            >
              {titleCase(s)}
            </button>
          );
        })}
      </div>
      {hasLocked && (
        <p className="mt-1.5 text-[10px] text-ink-mute">
          Las habilidades tachadas ya fueron otorgadas por tu clase.
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
    <div className="mt-2 rounded-md border border-accent-soft bg-paper p-2.5">
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
