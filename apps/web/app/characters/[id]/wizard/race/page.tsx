import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { parseAsis, type AbilityKey, type RaceData } from './_parsers';
import { RacePicker, type RaceEntry } from './_picker';

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

type Character = {
  id: string;
  campaignId: string;
  data: {
    race?: { slug: string; source: string };
    subrace?: { slug: string; source: string } | null;
    asisApplied?: Array<{ ability: string; bonus: number; source: 'race' | 'subrace' }>;
  } | null;
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

  const buckets: Array<{ entry: RaceEntry; source: 'race' | 'subrace' }> = [];
  if (parent) buckets.push({ entry: parent, source: 'race' });
  buckets.push({ entry: selected, source: selected.isSubrace ? 'subrace' : 'race' });

  for (const { entry, source } of buckets) {
    const slots = parseAsis(entry.data.ability);
    slots.forEach((slot, idx) => {
      if (slot.kind !== 'choose') return;
      const picks = asisApplied
        .filter(
          (a) =>
            a.source === source &&
            a.bonus === slot.amount &&
            slot.from.includes(a.ability.toLowerCase() as AbilityKey),
        )
        .map((a) => a.ability.toLowerCase() as AbilityKey)
        .slice(0, slot.count);
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

  const { data: list } = await api.get<{ data: RaceRow[] }>(
    `/compendium/races?campaign=${character.campaignId}&limit=200`,
    token,
  );

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
      <h2 className="text-lg font-semibold">Race</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Pick a race. Sub-races and parent races are listed together.
      </p>

      <div className="mt-6">
        <RacePicker
          characterId={id}
          entries={entries}
          initialSelection={initialSelection}
          initialChosenAsis={initialChosenAsis}
        />
      </div>
    </section>
  );
}
