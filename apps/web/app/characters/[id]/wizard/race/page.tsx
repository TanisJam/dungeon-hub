import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { effectiveAsiSlots, type AbilityKey, type RaceData } from './_parsers';
import { RacePicker, type RaceEntry, type FeatEntry, type CantripEntry } from './_picker';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';

type RaceRow = {
  id: string;
  slug: string;
  source: string;
  name: string;
  isSubrace: boolean;
  parentSlug: string | null;
  parentSource: string | null;
};

type RaceDetail = RaceRow & { data: RaceData };

type FeatRow = {
  id: string;
  slug: string;
  source: string;
  name: string;
};

type Character = {
  id: string;
  campaignId: string;
  data: {
    race?: { slug: string; source: string };
    subrace?: { slug: string; source: string } | null;
    asisApplied?: Array<{ ability: string; bonus: number; source: 'race' | 'subrace' }>;
    raceLanguageChoices?: string[];
    raceSkillChoices?: string[];
    raceFeatSlug?: string | null;
    raceCantrip?: { slug: string; source: string } | null;
  } | null;
};

type SpellRow = {
  id: string;
  slug: string;
  source: string;
  name: string;
  level: number;
};

type Props = { params: Promise<{ id: string }> };

/**
 * Reconstruye chosenAsis (Record<storageKey, AbilityKey[]>) a partir de los
 * asisApplied guardados + las race/subrace data del compendium. Operación
 * inversa de la expansión que hace el picker antes de submit.
 *
 * Para cada 'choose' slot encontrado en parent/subrace abilities, busca qué
 * abilities del asisApplied lo "llenan" (matching source + bonus + ability ∈ from).
 */
function deriveChosenAsis(
  asisApplied: Array<{ ability: string; bonus: number; source: 'race' | 'subrace' }>,
  parent: RaceEntry | null,
  selected: RaceEntry,
): Record<string, AbilityKey[]> {
  const out: Record<string, AbilityKey[]> = {};
  const { raceSlots, subraceSlots } = effectiveAsiSlots({
    parentAbility: parent?.data.ability,
    selectedAbility: selected.data.ability,
    selectedIsSubrace: selected.isSubrace,
  });

  const buckets: Array<{ slots: typeof raceSlots; source: 'race' | 'subrace' }> = [
    { slots: raceSlots, source: 'race' },
    { slots: subraceSlots, source: 'subrace' },
  ];

  for (const { slots, source } of buckets) {
    const consumed = new Set<number>();
    slots.forEach((slot, idx) => {
      if (slot.kind !== 'choose') return;
      const picks: AbilityKey[] = [];
      for (let i = 0; i < asisApplied.length; i++) {
        if (picks.length >= slot.count) break;
        if (consumed.has(i)) continue;
        const a = asisApplied[i]!;
        if (
          a.source === source &&
          a.bonus === slot.amount &&
          slot.from.includes(a.ability.toLowerCase() as AbilityKey)
        ) {
          picks.push(a.ability.toLowerCase() as AbilityKey);
          consumed.add(i);
        }
      }
      if (picks.length > 0) out[`${source}:${idx}`] = picks;
    });
  }

  return out;
}

export default async function RaceStepPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');
  const token = session.access_token;

  const character = await api.get<Character>(`/characters/${id}`, token);

  const [{ data: list }, { data: featList }, { data: spellList }] = await Promise.all([
    api.get<{ data: RaceRow[] }>(
      `/compendium/races?campaign=${character.campaignId}&limit=200`,
      token,
    ),
    api.get<{ data: FeatRow[] }>(
      `/compendium/feats?campaign=${character.campaignId}&limit=200`,
      token,
    ),
    // Batch 6: fetch wizard cantrips for High Elf picker. PHB p.23. Decision #606.
    api.get<{ data: SpellRow[] }>(
      `/compendium/spells?campaign=${character.campaignId}&class=wizard&level=0&limit=200`,
      token,
    ),
  ]);

  const detailed: RaceDetail[] = await Promise.all(
    list.map((row) =>
      api.get<RaceDetail>(
        `/compendium/races/${row.slug}?source=${row.source}&campaign=${character.campaignId}`,
        token,
      ),
    ),
  );

  const entries: RaceEntry[] = detailed.map((d) => ({
    slug: d.slug,
    source: d.source,
    name: d.name,
    isSubrace: d.isSubrace,
    parentSlug: d.parentSlug,
    parentSource: d.parentSource,
    data: d.data,
  }));

  const allFeats: FeatEntry[] = featList.map((f) => ({
    slug: f.slug,
    source: f.source,
    name: f.name,
  }));

  // Wizard cantrips for High Elf HighElfCantripPicker. Batch 6. PHB p.23.
  const allWizardCantrips: CantripEntry[] = spellList
    .filter((s) => s.level === 0)
    .map((s) => ({ slug: s.slug, source: s.source, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let initialSelection = null;
  let initialChosenAsis: Record<string, AbilityKey[]> = {};
  if (character.data?.race) {
    const r = character.data.race;
    const sr = character.data.subrace ?? null;

    initialSelection = {
      raceSlug: r.slug,
      raceSource: r.source,
      subraceSlug: sr?.slug ?? null,
      subraceSource: sr?.source ?? null,
    };

    // Find the actual selected entry + parent (if subrace) and derive chosen ASIs.
    const selectedKey = sr ? `${sr.slug}|${sr.source}` : `${r.slug}|${r.source}`;
    const selected = entries.find((e) => `${e.slug}|${e.source}` === selectedKey);
    const parent = selected?.isSubrace
      ? entries.find(
          (e) => e.slug === selected.parentSlug && e.source === selected.parentSource && !e.isSubrace,
        ) ?? null
      : null;

    if (selected && character.data.asisApplied) {
      initialChosenAsis = deriveChosenAsis(character.data.asisApplied, parent, selected);
    }
  }

  return (
    <section>
      <NumberedSectionHead
        num="02"
        title="Linaje"
        meta="Paso 2 de 6"
        description="Elegí el linaje de tu personaje. Las subrazas y razas padre aparecen juntas."
      />

      <div className="mt-6">
        <RacePicker
          characterId={id}
          entries={entries}
          allFeats={allFeats}
          allWizardCantrips={allWizardCantrips}
          initialSelection={initialSelection}
          initialChosenAsis={initialChosenAsis}
          initialLanguageChoices={character.data?.raceLanguageChoices ?? []}
          initialSkillChoices={character.data?.raceSkillChoices ?? []}
          initialFeatSlug={character.data?.raceFeatSlug ?? null}
          initialRaceCantrip={character.data?.raceCantrip ?? null}
        />
      </div>
    </section>
  );
}
