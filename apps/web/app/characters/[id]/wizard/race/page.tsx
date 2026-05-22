import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import type { RaceData } from './_parsers';
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
    appliedAsis?: Array<{ ability: string; bonus: number; source: string }>;
  } | null;
};

type Props = { params: Promise<{ id: string }> };

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

  // Fetch details in parallel. ~30-60 races típicamente.
  const detailed: RaceDetail[] = await Promise.all(
    list.map(async (row) => {
      const detail = await api.get<RaceDetail>(
        `/compendium/races/${row.slug}?source=${row.source}&campaign=${character.campaignId}`,
        token,
      );
      return detail;
    }),
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
          initialSelection={
            character.data?.race
              ? {
                  raceSlug: character.data.race.slug,
                  raceSource: character.data.race.source,
                  subraceSlug: character.data.subrace?.slug ?? null,
                  subraceSource: character.data.subrace?.source ?? null,
                }
              : null
          }
        />
      </div>
    </section>
  );
}
