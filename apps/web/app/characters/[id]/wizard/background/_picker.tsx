'use client';

import { useMemo, useState, useTransition } from 'react';
import { parseBackground, type BackgroundData, type ParsedBackground } from './_parsers';
import { poolFor, titleCase, ANY_LANGUAGES } from './_options';
import { TOOL_CATEGORY_MAP } from '@dungeon-hub/domain/character/tool';
import { CustomizationSchema } from '@dungeon-hub/domain/character/background';
import type {
  MixedPoolShape,
  BackgroundPackage,
  FeatureOption,
  Customization,
  MixedPoolShapeKey,
  BackgroundCompendiumData,
} from '@dungeon-hub/domain/character/background';
import { saveBackground } from './actions';
import { ChoiceList } from '@/components/wizard/choice-list';
import type { ChoiceOption } from '@/components/wizard/choice-list';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';

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
  customization?: Customization;
};

function entryKey(e: { slug: string; source: string }): string {
  return `${e.slug}|${e.source}`;
}

const LANG_CHOOSE_KEYS = ['anyStandard', 'anyExotic', 'any', 'anyLanguage'] as const;
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
  allBackgrounds,
  initialSelection,
  lockedSkills = [],
}: {
  characterId: string;
  entries: BackgroundEntry[];
  allBackgrounds: BackgroundCompendiumData[];
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
  const [customization, setCustomization] = useState<Customization | undefined>(
    initialSelection?.customization,
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
  const parsed = useMemo(
    () =>
      selected
        ? parseBackground({ ...selected.data, slug: selected.slug }, allBackgrounds)
        : null,
    [selected, allBackgrounds],
  );

  function reset() {
    setSkills([]);
    setLangs([]);
    setTools({});
    setCustomization(undefined);
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

    if (parsed.toolChoose && (tools['choose']?.length ?? 0) !== parsed.toolChoose.count) {
      const n = parsed.toolChoose.count;
      setError(`Elegí ${n} herramienta${n > 1 ? 's' : ''}.`);
      return;
    }

    // Custom Background customization validation
    if (parsed.customization) {
      const result = CustomizationSchema.safeParse(customization);
      if (!result.success) {
        setError('Completá la personalización del trasfondo (mezcla, equipo y característica).');
        return;
      }
      // Validate mixedPool completeness (langs + tools count must match shape)
      if (result.data.mixedPool) {
        const shape = parsed.customization.mixedPool.find(
          (s) => s.shapeKey === result.data.mixedPool!.shape,
        );
        if (shape) {
          if (result.data.mixedPool.langs.length !== shape.langCount) {
            setError(`Elegí ${shape.langCount} idioma${shape.langCount > 1 ? 's' : ''} para la mezcla.`);
            return;
          }
          if (result.data.mixedPool.tools.length !== shape.toolCount) {
            setError(`Elegí ${shape.toolCount} herramienta${shape.toolCount > 1 ? 's' : ''} para la mezcla.`);
            return;
          }
        }
      }
    }

    startTransition(async () => {
      const res = await saveBackground(
        characterId,
        { slug: selected.slug, source: selected.source },
        skills,
        langs,
        tools,
        parsed.customization ? (customization ?? undefined) : undefined,
      );
      if (res.error) setError(res.error);
    });
  }

  // Build ChoiceList options
  const options: ChoiceOption<string>[] = filtered.map((e) => {
    const key = entryKey(e);
    const p = parseBackground({ ...e.data, slug: e.slug }, allBackgrounds);

    const isThisSelected = key === selectedKey;
    const currentParsed = isThisSelected ? parsed : p;

    // Tag pills: one pill per fixed skill, then tools/languages summary, then source
    const pills: ChoiceOption<string>['pills'] = [
      ...p.fixedSkills.map((s) => ({ tone: 'green' as const, label: titleCase(s) })),
      ...(p.skillChoose ? [{ tone: 'green' as const, label: `+${p.skillChoose.count} elección` }] : []),
      ...(p.fixedTools.length > 0 || Object.keys(p.toolChooseCounts).length > 0 || p.toolChoose !== null
        ? [{ tone: 'stone' as const, label: 'Herramientas' }]
        : []),
      ...(p.fixedLanguages.length > 0 || Object.keys(p.languageChooseCounts).length > 0
        ? [{ tone: 'stone' as const, label: 'Idiomas' }]
        : []),
      { tone: 'stone' as const, label: e.source },
    ];

    return {
      key,
      title: e.name,
      pills,
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
          customization={isThisSelected ? customization : undefined}
          onCustomizationChange={isThisSelected ? setCustomization : undefined}
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

      <WizardFooterNav
        backHref={`/characters/${characterId}/wizard/class`}
        onNext={handleContinue}
        pending={pending}
        disabled={!selected}
        error={error}
      />
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
  customization,
  onCustomizationChange,
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
  customization?: Customization;
  onCustomizationChange?: (v: Customization | undefined) => void;
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
      {(parsed.fixedTools.length > 0 || Object.keys(parsed.toolChooseCounts).length > 0 || parsed.toolChoose !== null) && (
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
                pool={poolFor(kind).filter((t) => !parsed.fixedTools.includes(t.toLowerCase()))}
                selected={sel}
                count={count}
                onChange={(vals) => setToolsForKind(kind, vals)}
              />
            );
          })}
          {parsed.toolChoose && (
            <MultiSelectChoose
              label={`Elegí ${parsed.toolChoose.count} herramienta${parsed.toolChoose.count > 1 ? 's' : ''}`}
              pool={parsed.toolChoose.from.filter((t) => !parsed.fixedTools.includes(t.toLowerCase()))}
              selected={tools['choose'] ?? []}
              count={parsed.toolChoose.count}
              onChange={(vals) => setToolsForKind('choose', vals)}
            />
          )}
        </div>
      )}

      {/* Custom Background customization — stacked below skill picker */}
      {parsed.customization && onCustomizationChange && (
        <div className="space-y-4 border-t border-line pt-3">
          <MixedPoolPicker
            shapes={parsed.customization.mixedPool}
            value={customization?.mixedPool}
            onChange={(v) => onCustomizationChange({ ...customization, mixedPool: v })}
          />
          <EquipmentPicker
            packages={parsed.customization.equipment.packages}
            coinAllowed={parsed.customization.equipment.coinAllowed}
            value={customization?.equipment}
            onChange={(v) => onCustomizationChange({ ...customization, equipment: v })}
          />
          <FeaturePicker
            features={parsed.customization.feature.features}
            value={customization?.feature}
            onChange={(v) => onCustomizationChange({ ...customization, feature: v })}
          />
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
  pool: readonly string[];
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
  pool: readonly string[];
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

// ---------------------------------------------------------------------------
// B.4 MixedPoolPicker — shape radio + dynamic sub-pickers
// ---------------------------------------------------------------------------

const SHAPE_LABELS: Record<string, string> = {
  lang2: '2 idiomas',
  lang1tool1: '1 idioma + 1 herramienta',
  tool2: '2 herramientas',
};

export function MixedPoolPicker({
  shapes,
  value,
  onChange,
}: {
  shapes: MixedPoolShape[];
  value: Customization['mixedPool'];
  onChange: (v: Customization['mixedPool']) => void;
}) {
  const selected = shapes.find((s) => s.shapeKey === value?.shape) ?? null;

  function selectShape(shapeKey: MixedPoolShapeKey) {
    onChange({ shape: shapeKey, langs: [], tools: [] });
  }

  function setLangs(vals: string[]) {
    if (!value) return;
    onChange({ ...value, langs: vals });
  }

  function setTools(vals: string[]) {
    if (!value) return;
    onChange({ ...value, tools: vals });
  }

  const toolPool: readonly string[] = TOOL_CATEGORY_MAP['anyTool'] ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Habilidades, idiomas y herramientas
      </p>
      <div className="flex flex-col gap-2">
        {shapes.map((shape) => {
          const isSelected = value?.shape === shape.shapeKey;
          return (
            <label
              key={shape.shapeKey}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-line bg-paper p-2.5 text-sm text-ink transition hover:border-accent-soft"
            >
              <input
                type="radio"
                name="mixed-pool-shape"
                value={shape.shapeKey}
                checked={isSelected}
                onChange={() => selectShape(shape.shapeKey)}
                className="accent-primary"
              />
              {SHAPE_LABELS[shape.shapeKey] ?? shape.shapeKey}
            </label>
          );
        })}
      </div>

      {selected && value && (
        <div className="space-y-2 pl-2">
          {selected.langCount > 0 && (
            <MultiSelectChoose
              label={`Elegí ${selected.langCount} idioma${selected.langCount > 1 ? 's' : ''}`}
              pool={ANY_LANGUAGES}
              selected={value.langs}
              count={selected.langCount}
              onChange={setLangs}
            />
          )}
          {selected.toolCount > 0 && (
            <MultiSelectChoose
              label={`Elegí ${selected.toolCount} herramienta${selected.toolCount > 1 ? 's' : ''}`}
              pool={toolPool}
              selected={value.tools}
              count={selected.toolCount}
              onChange={setTools}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// B.6 EquipmentPicker — package select + coin toggle + a/b radio
// ---------------------------------------------------------------------------

type EquipmentValue = Customization['equipment'];

export function EquipmentPicker({
  packages,
  coinAllowed,
  value,
  onChange,
}: {
  packages: BackgroundPackage[];
  coinAllowed: boolean;
  value: EquipmentValue;
  onChange: (v: EquipmentValue) => void;
}) {
  const mode = value?.kind ?? 'package';
  const selectedPackage =
    value?.kind === 'package'
      ? packages.find(
          (p) => p.backgroundSlug === value.backgroundSlug && p.backgroundSource === value.backgroundSource,
        ) ?? null
      : null;

  const choiceSlot = value?.kind === 'package' ? value.choiceSlot : undefined;
  const altSlots = selectedPackage
    ? (Object.keys(selectedPackage.alternatives) as Array<'a' | 'b' | 'c' | 'd'>)
    : [];

  function selectMode(kind: 'package' | 'coin') {
    if (kind === 'coin') {
      onChange({ kind: 'coin' });
    } else {
      onChange(undefined);
    }
  }

  function selectBg(slug: string, source: string) {
    onChange({ kind: 'package', backgroundSlug: slug, backgroundSource: source });
  }

  function selectSlot(slot: 'a' | 'b' | 'c' | 'd') {
    if (value?.kind !== 'package') return;
    onChange({ ...value, choiceSlot: slot });
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Equipo</p>

      {/* Mode toggle */}
      <div className="flex flex-col gap-2">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-line bg-paper p-2.5 text-sm text-ink transition hover:border-accent-soft">
          <input
            type="radio"
            name="equipment-mode"
            value="package"
            checked={mode === 'package'}
            onChange={() => selectMode('package')}
            className="accent-primary"
          />
          Usar equipo de trasfondo
        </label>
        {coinAllowed && (
          <label
            aria-label="Gastar monedas en equipo"
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-line bg-paper p-2.5 text-sm text-ink transition hover:border-accent-soft"
          >
            <input
              type="radio"
              name="equipment-mode"
              value="coin"
              checked={mode === 'coin'}
              onChange={() => selectMode('coin')}
              className="accent-primary"
            />
            Gastar monedas en equipo
          </label>
        )}
      </div>

      {/* Package selector */}
      {mode === 'package' && (
        <div className="space-y-2">
          <select
            value={value?.kind === 'package' ? `${value.backgroundSlug}|${value.backgroundSource}` : ''}
            onChange={(e) => {
              const [slug, src] = e.target.value.split('|');
              if (slug && src) selectBg(slug, src);
            }}
            className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">Elegí un trasfondo…</option>
            {packages.map((p) => (
              <option key={`${p.backgroundSlug}|${p.backgroundSource}`} value={`${p.backgroundSlug}|${p.backgroundSource}`}>
                {p.backgroundName}
              </option>
            ))}
          </select>

          {selectedPackage && (
            <div className="space-y-2">
              {selectedPackage.alwaysGranted.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-mute">Siempre otorgado:</p>
                  <ul className="mt-1 space-y-0.5">
                    {selectedPackage.alwaysGranted.map((item, i) => (
                      <li key={i} className="text-xs">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {altSlots.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-mute">Elegí una opción:</p>
                  <div className="mt-1 flex flex-col gap-1.5">
                    {altSlots.map((slot) => {
                      const items = selectedPackage.alternatives[slot] ?? [];
                      return (
                        <label
                          key={slot}
                          className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-md border border-line bg-paper p-2.5 transition hover:border-accent-soft"
                        >
                          <input
                            type="radio"
                            name="equipment-slot"
                            value={slot}
                            checked={choiceSlot === slot}
                            onChange={() => selectSlot(slot)}
                            className="mt-0.5 accent-primary"
                          />
                          <ul className="space-y-0.5">
                            {items.map((item, i) => (
                              <li key={i} className="text-xs">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// B.8 FeaturePicker — filter input + native select + preview
// ---------------------------------------------------------------------------

export function FeaturePicker({
  features,
  value,
  onChange,
}: {
  features: FeatureOption[];
  value: Customization['feature'];
  onChange: (v: Customization['feature']) => void;
}) {
  const [filterQuery, setFilterQuery] = useState('');

  const filtered = filterQuery.trim()
    ? features.filter((f) =>
        f.name.toLowerCase().includes(filterQuery.trim().toLowerCase()),
      )
    : features;

  const selectedFeature = value?.slug ? features.find((f) => f.slug === value.slug) ?? null : null;

  function handleSelect(slug: string) {
    if (!slug) {
      onChange(undefined);
    } else {
      onChange({ slug });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Característica</p>

      {/* Filter input */}
      <input
        type="search"
        role="searchbox"
        placeholder="Filtrar característica…"
        value={filterQuery}
        onChange={(e) => setFilterQuery(e.target.value)}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none"
      />

      {/* Native select */}
      <select
        value={value?.slug ?? ''}
        onChange={(e) => handleSelect(e.target.value)}
        size={1}
        className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none"
      >
        <option value="">Elegí una característica…</option>
        {filtered.map((f) => (
          <option key={f.slug} value={f.slug}>
            {f.name}
          </option>
        ))}
      </select>

      {/* Preview */}
      {selectedFeature && (
        <p className="rounded-md border border-line bg-paper p-2.5 text-xs text-ink">
          {selectedFeature.text}
        </p>
      )}
    </div>
  );
}
