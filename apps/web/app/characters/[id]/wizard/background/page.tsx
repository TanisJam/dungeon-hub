import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import type { BackgroundData } from './_parsers';
import { BackgroundPicker, type BackgroundEntry } from './_picker';

type BgRow = { id: string; slug: string; source: string; name: string };
type BgDetail = BgRow & { data: BackgroundData };

type Character = {
  id: string;
  campaignId: string;
  data: {
    background?: { slug: string; source: string };
    backgroundChoices?: {
      skills?: string[];
      languages?: string[];
      tools?: Record<string, string[]>;
    };
  } | null;
};

type Props = { params: Promise<{ id: string }> };

export default async function BackgroundStepPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');
  const token = session.access_token;

  const character = await api.get<Character>(`/characters/${id}`, token);

  const { data: list } = await api.get<{ data: BgRow[] }>(
    `/compendium/backgrounds?campaign=${character.campaignId}&limit=200`,
    token,
  );

  const detailed: BgDetail[] = await Promise.all(
    list.map((row) =>
      api.get<BgDetail>(
        `/compendium/backgrounds/${row.slug}?source=${row.source}&campaign=${character.campaignId}`,
        token,
      ),
    ),
  );

  const entries: BackgroundEntry[] = detailed.map((d) => ({
    slug: d.slug,
    source: d.source,
    name: d.name,
    data: d.data,
  }));

  return (
    <section>
      <h2 className="text-lg font-semibold">Background</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Pick your character&apos;s background.
      </p>

      <div className="mt-6">
        <BackgroundPicker
          characterId={id}
          entries={entries}
          initialSelection={
            character.data?.background
              ? {
                  slug: character.data.background.slug,
                  source: character.data.background.source,
                  skillChoices: character.data.backgroundChoices?.skills ?? [],
                  languageChoices: character.data.backgroundChoices?.languages ?? [],
                  toolChoices: character.data.backgroundChoices?.tools ?? {},
                }
              : null
          }
        />
      </div>
    </section>
  );
}
