import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { parseBackground, type BackgroundData } from './_parsers';
import { poolFor } from './_options';
import { BackgroundPicker, type BackgroundEntry } from './_picker';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';

type BgRow = { id: string; slug: string; source: string; name: string };
type BgDetail = BgRow & { data: BackgroundData };

type AppliedBackground = {
  slug: string;
  source: string;
  skills?: string[];
  languages?: string[];
  tools?: string[];
};

type AppliedClass = { skillChoices?: string[] };

type Character = {
  id: string;
  campaignId: string;
  data: {
    background?: AppliedBackground;
    classes?: AppliedClass[];
  } | null;
};

type Props = { params: Promise<{ id: string }> };

const TOOL_KINDS = ['anyGamingSet', 'anyArtisansTool', 'anyMusicalInstrument', 'any'] as const;

/**
 * Reconstruye los CHOICES del usuario a partir del appliedBackground guardado
 * (que es fixed+chosen merged) y la background data del compendium (que indica
 * cuáles son fixed). Es la operación inversa del merge que hace la API.
 */
function deriveChoices(applied: AppliedBackground, bgData: BackgroundData) {
  const parsed = parseBackground(bgData);
  const fixedSkills = new Set(parsed.fixedSkills.map((s) => s.toLowerCase()));
  const fixedLangs = new Set(parsed.fixedLanguages.map((s) => s.toLowerCase()));
  const fixedTools = new Set(parsed.fixedTools.map((s) => s.toLowerCase()));

  const skillChoices = (applied.skills ?? []).filter((s) => !fixedSkills.has(s.toLowerCase()));
  const languageChoices = (applied.languages ?? []).filter((l) => !fixedLangs.has(l.toLowerCase()));

  // Tools: para cada tool elegido, encontrar a qué "kind" pertenece (basado en pool).
  const toolChoices: Record<string, string[]> = {};
  for (const tool of applied.tools ?? []) {
    const lower = tool.toLowerCase();
    if (fixedTools.has(lower)) continue;
    for (const kind of TOOL_KINDS) {
      if (poolFor(kind).includes(lower)) {
        (toolChoices[kind] ??= []).push(lower);
        break;
      }
    }
  }

  return { skillChoices, languageChoices, toolChoices };
}

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

  // Si hay background guardado, derivamos los choices del compendium data del bg.
  let initialSelection = null;
  if (character.data?.background) {
    const applied = character.data.background;
    const matching = detailed.find(
      (d) => d.slug === applied.slug && d.source === applied.source,
    );
    const choices = matching
      ? deriveChoices(applied, matching.data)
      : { skillChoices: [], languageChoices: [], toolChoices: {} };
    initialSelection = {
      slug: applied.slug,
      source: applied.source,
      ...choices,
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
          initialSelection={initialSelection}
          lockedSkills={(character.data?.classes?.[0]?.skillChoices ?? []).map((s) =>
            s.toLowerCase(),
          )}
        />
      </div>
    </section>
  );
}
