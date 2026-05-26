import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { deriveChoices, type BackgroundData } from './_parsers';
import { BackgroundPicker, type BackgroundEntry } from './_picker';
import type {
  BackgroundCompendiumData,
  Customization,
} from '@dungeon-hub/domain/character/background';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';

type BgRow = { id: string; slug: string; source: string; name: string };
type BgDetail = BgRow & { data: BackgroundData };

type AppliedBackground = {
  slug: string;
  source: string;
  skills?: string[];
  languages?: string[];
  tools?: string[];
  customization?: Customization;
};

type AppliedClass = { skillChoices?: string[] };

type Character = {
  id: string;
  worldId: string;
  data: {
    background?: AppliedBackground;
    classes?: AppliedClass[];
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
    `/compendium/backgrounds?world=${character.worldId}&limit=200`,
    token,
  );

  const detailed: BgDetail[] = await Promise.all(
    list.map((row) =>
      api.get<BgDetail>(
        `/compendium/backgrounds/${row.slug}?source=${row.source}&world=${character.worldId}`,
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

  const allBackgrounds: BackgroundCompendiumData[] = detailed.map((d) => ({
    ...d.data,
    slug: d.slug,
    source: d.source,
    name: d.name,
  }));

  // Si hay background guardado, derivamos los choices del compendium data del bg.
  let initialSelection = null;
  if (character.data?.background) {
    const applied = character.data.background;
    const matching = detailed.find(
      (d) => d.slug === applied.slug && d.source === applied.source,
    );
    const choices = matching
      ? deriveChoices(applied, matching.data, allBackgrounds)
      : { skillChoices: [], languageChoices: [], toolChoices: {} };
    initialSelection = {
      slug: applied.slug,
      source: applied.source,
      ...choices,
      ...(applied.customization ? { customization: applied.customization } : {}),
    };
  }

  return (
    <section>
      <NumberedSectionHead
        num="04"
        title="Trasfondo"
        meta="Paso 4 de 6"
        description="Elegí el trasfondo de tu personaje."
      />

      <div className="mt-6">
        <BackgroundPicker
          characterId={id}
          entries={entries}
          allBackgrounds={allBackgrounds}
          initialSelection={initialSelection}
          lockedSkills={(character.data?.classes?.[0]?.skillChoices ?? []).map((s) =>
            s.toLowerCase(),
          )}
        />
      </div>
    </section>
  );
}
