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
import { ChoiceList } from '@/components/wizard/choice-list';
import type { ChoiceOption } from '@/components/wizard/choice-list';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';

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
      setError('Elegí una clase primero.');
      return;
    }
    if (skillChoice && skills.length !== skillChoice.count) {
      setError(`Elegí exactamente ${skillChoice.count} habilidades.`);
      return;
    }
    if (needsSubclass && !subclassKey) {
      setError(`Elegí un ${selected.data.subclassTitle ?? 'subclase'}.`);
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

  // Build ChoiceList options
  const options: ChoiceOption<string>[] = filtered.map((e) => {
    const key = entryKey(e);
    const hd = formatHitDie(e.data.hd);
    const primary = formatPrimary(e.data.primaryAbility);
    const saves = formatSaves(e.data.proficiency);

    // These are captured as closures — they're the selected state from above
    // which updates when this entry is selected via the outer state.
    const isThisSelected = key === selectedKey;
    const currentSkills = isThisSelected ? skills : [];
    const currentSubclassKey = isThisSelected ? subclassKey : null;

    // Tag pills: hit die, primary ability, saving throws
    const pills: ChoiceOption<string>['pills'] = [];
    if (hd && hd !== '—') pills.push({ tone: 'amber', label: hd });
    if (primary) pills.push({ tone: 'green', label: primary });
    if (saves && saves !== '—') pills.push({ tone: 'stone', label: `Salv. ${saves}` });
    pills.push({ tone: 'stone', label: e.source });

    return {
      key,
      title: e.name,
      pills,
      detail: (
        <ClassDetailInline
          entry={e}
          skillChoice={isThisSelected ? skillChoice : getSkillChoice(e.data)}
          selectedSkills={currentSkills}
          toggleSkill={toggleSkill}
          lockedSkills={lockedSet}
          needsSubclass={requiresL1Subclass(e.data)}
          subclassOptions={subclassesByClass[key] ?? []}
          subclassKey={currentSubclassKey}
          onSubclassSelect={(k) => {
            setSubclassKey(k);
            setError(null);
          }}
        />
      ),
    };
  });

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Buscar clase…"
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
              setSkills([]);
              setSubclassKey(null);
            }
            setSelectedKey(key);
            setError(null);
          }}
        />
      )}

      <WizardFooterNav
        backHref={`/characters/${characterId}/wizard/race`}
        onNext={handleContinue}
        pending={pending}
        disabled={!selected}
        error={error}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Class detail inline (inside ChoiceCard expand zone)
// ---------------------------------------------------------------------------

function ClassDetailInline({
  entry,
  skillChoice,
  selectedSkills,
  toggleSkill,
  lockedSkills,
  needsSubclass,
  subclassOptions,
  subclassKey,
  onSubclassSelect,
}: {
  entry: ClassEntry;
  skillChoice: ReturnType<typeof getSkillChoice>;
  selectedSkills: string[];
  toggleSkill: (s: string) => void;
  lockedSkills: Set<string>;
  needsSubclass: boolean;
  subclassOptions: SubclassRow[];
  subclassKey: string | null;
  onSubclassSelect: (key: string | null) => void;
}) {
  const d = entry.data;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-mute">
        Dado de golpe {formatHitDie(d.hd)} · Salvaciones {formatSaves(d.proficiency)}
        {formatPrimary(d.primaryAbility) && ` · Primario ${formatPrimary(d.primaryAbility)}`}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Prof label="Armadura" value={formatProfs(d.startingProficiencies?.armor)} />
        <Prof label="Armas" value={formatProfs(d.startingProficiencies?.weapons)} />
        {d.startingProficiencies?.tools && (
          <Prof label="Herramientas" value={formatProfs(d.startingProficiencies?.tools)} />
        )}
      </div>

      {skillChoice && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Habilidades — elegí {skillChoice.count}
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
                  title={isLocked ? 'Ya otorgada por tu trasfondo' : undefined}
                  className={[
                    'rounded px-2 py-1 text-xs ring-1 ring-inset transition',
                    isLocked
                      ? 'bg-paper-soft text-ink-mute ring-line line-through cursor-not-allowed'
                      : isOn
                        ? 'bg-primary-soft text-primary-deep ring-primary'
                        : 'text-ink-soft ring-line hover:ring-primary-soft disabled:opacity-30',
                  ].join(' ')}
                >
                  {titleCase(s)}
                </button>
              );
            })}
          </div>
          {lockedSkills.size > 0 && (
            <p className="mt-1 text-[10px] text-ink-mute">
              Las habilidades tachadas ya fueron otorgadas por tu trasfondo.
            </p>
          )}
        </div>
      )}

      {needsSubclass && (
        <SubclassPicker
          title={d.subclassTitle ?? 'Subclase'}
          options={subclassOptions}
          selectedKey={subclassKey}
          onSelect={onSubclassSelect}
        />
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
      <div className="rounded-md border border-warning-soft bg-warning-soft/30 p-2.5">
        <p className="text-xs text-warning-deep">
          {title} requerida en N1, pero no hay opciones en el compendium.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        {title} — elegí 1
      </p>
      <div className="mt-2 grid grid-cols-1 gap-1.5">
        {options.map((sc) => {
          const k = `${sc.slug}|${sc.source}`;
          const isOn = k === selectedKey;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(isOn ? null : k)}
              className={[
                'rounded-md border px-3 py-2 text-left text-xs transition',
                isOn
                  ? 'border-accent bg-accent-soft text-accent-deep'
                  : 'border-line bg-paper-soft text-ink-soft hover:border-accent-soft',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{sc.name}</span>
                <span className="shrink-0 text-[9px] uppercase text-ink-mute">{sc.source}</span>
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">{label}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{value}</p>
    </div>
  );
}
