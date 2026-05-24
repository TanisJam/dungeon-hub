import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';
import { NoPicksPanel } from './_no-picks-panel';
import { SpellsPicker } from './_picker';
import { RaceCantripCard } from './_race-cantrip-card';

// ── Types ──────────────────────────────────────────────────────────────────

type SpellRef = { slug: string; source: string };

type AppliedClass = {
  slug: string;
  source: string;
  level: number;
  subclass?: { slug: string; source: string } | null;
};

type RaceRow = {
  slug: string;
  source: string;
  name: string;
  isSubrace: boolean;
  parentSlug: string | null;
  parentSource: string | null;
};

type Character = {
  id: string;
  campaignId: string;
  data: {
    classes?: AppliedClass[];
    spells?: Record<string, { cantrips: SpellRef[]; known: SpellRef[]; prepared: SpellRef[] }>;
    raceCantrip?: { slug: string; source: string } | null;
    race?: { slug: string; source: string };
    subrace?: { slug: string; source: string } | null;
  } | null;
};

type SpellLimitsView = {
  cantripsKnown: number;
  spellsKnown: number | null;
  spellsPrepared: number | null;
  maxSpellLevel: number;
  wizardSpellbookSize?: number;
  ability: 'int' | 'wis' | 'cha' | null;
};

type AvailableSpell = {
  slug: string;
  source: string;
  name: string;
  level: number;
  school: string;
};

type SpellOptionsResponse = {
  limits: SpellLimitsView;
  availableSpells: AvailableSpell[];
  subclassGrantedSlugs: string[];
};

type WizardCantrip = {
  slug: string;
  source: string;
  name: string;
  level: number;
};

// ── Page ───────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ id: string }> };

export default async function SpellsStepPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/');
  const token = session.access_token;

  const character = await api.get<Character>(`/characters/${id}`, token);

  const primaryClass = character.data?.classes?.[0];
  if (!primaryClass) redirect(`/characters/${id}/wizard/class`);

  const raceCantripRef = character.data?.raceCantrip ?? null;

  const [options, wizardCantripsResp, raceListResp] = await Promise.all([
    api.get<SpellOptionsResponse>(
      `/characters/${id}/classes/${primaryClass.slug}/spells/options`,
      token,
    ),
    raceCantripRef
      ? api.get<{ data: WizardCantrip[] }>(
          `/compendium/spells?campaign=${character.campaignId}&class=wizard&level=0&limit=200`,
          token,
        )
      : Promise.resolve(null),
    raceCantripRef
      ? api.get<{ data: RaceRow[] }>(
          `/compendium/races?campaign=${character.campaignId}&limit=200`,
          token,
        )
      : Promise.resolve(null),
  ]);

  // Resolve cantrip name from the fetched list; fall back to slug if not found.
  let raceCantripName: string | null = null;
  // Resolve race name: prefer subrace name, fall back to race name, then slug.
  let raceName: string | null = null;
  if (raceCantripRef) {
    const match = wizardCantripsResp?.data?.find(
      (s) => s.slug === raceCantripRef.slug && s.source === raceCantripRef.source,
    );
    raceCantripName = match?.name ?? raceCantripRef.slug;

    const raceList = raceListResp?.data ?? [];
    const subraceRef = character.data?.subrace ?? null;
    const raceRef = character.data?.race ?? null;

    if (subraceRef) {
      const subraceRow = raceList.find(
        (r) => r.slug === subraceRef.slug && r.source === subraceRef.source,
      );
      if (subraceRow) {
        const parentRow = raceList.find(
          (r) => r.slug === subraceRow.parentSlug && r.source === subraceRow.parentSource,
        );
        raceName = parentRow ? `${subraceRow.name} ${parentRow.name}` : subraceRow.name;
      }
    }
    if (!raceName && raceRef) {
      const raceRow = raceList.find(
        (r) => r.slug === raceRef.slug && r.source === raceRef.source,
      );
      raceName = raceRow?.name ?? null;
    }
    // Final fallback: use slug as display
    if (!raceName) {
      raceName = subraceRef?.slug ?? raceRef?.slug ?? null;
    }
  }

  const { limits } = options;

  const needsPicks =
    limits.cantripsKnown > 0 ||
    (limits.spellsKnown !== null && limits.spellsKnown > 0) ||
    (limits.spellsPrepared !== null && limits.spellsPrepared > 0) ||
    limits.maxSpellLevel > 0;

  const nonCaster = limits.ability === null;

  const initialSpells = character.data?.spells?.[primaryClass.slug] ?? {
    cantrips: [],
    known: [],
    prepared: [],
  };

  return (
    <section>
      <NumberedSectionHead
        num="05"
        title="Hechizos"
        meta="Paso 5 de 6"
        description="Elegí los hechizos de tu clase."
      />

      <div className="mt-6 space-y-4">
        {raceCantripName && raceName && (
          <RaceCantripCard cantripName={raceCantripName} raceName={raceName} />
        )}

        {!needsPicks ? (
          <NoPicksPanel
            characterId={id}
            variant={nonCaster ? 'non-caster' : 'too-early'}
            className={primaryClass.slug}
            level={primaryClass.level}
          />
        ) : (
          <SpellsPicker
            characterId={id}
            classSlug={primaryClass.slug}
            classSource={primaryClass.source}
            limits={limits}
            availableSpells={options.availableSpells}
            subclassGrantedSlugs={options.subclassGrantedSlugs}
            initialSpells={initialSpells}
          />
        )}
      </div>
    </section>
  );
}
