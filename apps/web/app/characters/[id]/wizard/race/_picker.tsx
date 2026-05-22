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
  type AbilityKey,
  type AsiSlot,
  type RaceData,
} from './_parsers';
import { saveRace } from './actions';
import { ChoiceList } from '@/components/wizard/choice-list';
import type { ChoiceOption } from '@/components/wizard/choice-list';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';

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
}: {
  characterId: string;
  entries: RaceEntry[];
  initialSelection: Selection | null;
  initialChosenAsis?: Record<string, AbilityKey[]>;
}) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (!initialSelection) return null;
    return initialSelection.subraceSlug
      ? `${initialSelection.subraceSlug}|${initialSelection.subraceSource}`
      : `${initialSelection.raceSlug}|${initialSelection.raceSource}`;
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

    startTransition(async () => {
      const res = await saveRace(characterId, racePart, subracePart, appliedAsis);
      if (res.error) setError(res.error);
    });
  }

  // Build ChoiceList options
  const options: ChoiceOption<string>[] = filtered.map((e) => {
    const key = entryKey(e);
    const asis = parseAsis(e.data.ability);
    const asiSummary = formatAsisSummary(asis);
    const speedStr = formatSpeed(e.data.speed);
    const sub = [asiSummary, speedStr ? `Velocidad ${speedStr}` : null]
      .filter(Boolean)
      .join(' · ');

    const parentEntry = e.isSubrace && e.parentSlug
      ? entries.find((p) => p.slug === e.parentSlug && p.source === e.parentSource && !p.isSubrace) ?? null
      : null;

    return {
      key,
      title: displayName(e, entries),
      sub: sub || undefined,
      metaPills: [{ tone: 'stone' as const, label: e.source }],
      detail: (
        <RaceDetailPanel
          entry={e}
          parent={parentEntry}
          chosenAsis={chosenAsis}
          setChosenAsis={(next) => {
            setChosenAsis(next);
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
            if (key !== selectedKey) setChosenAsis({});
            setSelectedKey(key);
            setError(null);
          }}
        />
      )}

      {error && <p className="text-sm text-warning-deep">{error}</p>}

      <WizardFooterNav
        backHref={`/characters/${characterId}/wizard/stats`}
        onNext={handleContinue}
        pending={pending}
        disabled={!selected}
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

      {langs && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">Idiomas</p>
          <p className="mt-1 text-xs text-ink">{langs}</p>
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
