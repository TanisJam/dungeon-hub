import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import type { AppliedClass as DomainAppliedClass } from '@dungeon-hub/domain/character/class';
import { classifyCaster } from '@dungeon-hub/domain/character/spellcasting';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';
import { NoPicksPanel } from './_no-picks-panel';
import { SinglePickerView } from './_single-picker-view';
import { MulticlassSpellsView, type CasterTabData } from './_multiclass-view';
import { RaceCantripCard } from './_race-cantrip-card';
// SP-07: Spanish class label helper — extracted to _class-labels.ts for testability
import { classLabel } from './_class-labels';
export { classLabel, CLASS_LABEL_ES } from './_class-labels';

// ── Types ──────────────────────────────────────────────────────────────────

type SpellRef = { slug: string; source: string };

type AppliedClass = {
  slug: string;
  source: string;
  level: number;
  subclass?: { slug: string; source: string } | null;
  // domain AppliedClass has more fields; page only needs these
  hitDie?: string;
  savingThrows?: string[];
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
  toolProficiencies?: string[];
  skillChoices?: string[];
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
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  componentsMCost: number | null;
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

// ── Helpers ────────────────────────────────────────────────────────────────

function hasPicks(limits: SpellLimitsView): boolean {
  return (
    limits.cantripsKnown > 0 ||
    (limits.spellsKnown !== null && limits.spellsKnown > 0) ||
    (limits.spellsPrepared !== null && limits.spellsPrepared > 0) ||
    limits.maxSpellLevel > 0
  );
}

// classLabel imported from _class-labels.ts at top of file (SP-07: Spanish labels)

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

  const allClasses = character.data?.classes ?? [];
  if (allClasses.length === 0) redirect(`/characters/${id}/wizard/class`);

  // Filter to caster classes using domain classifyCaster (REQ-SP06-LOOP-CASTERS)
  // classifyCaster only reads slug + subclass; cast the minimal shape to satisfy typing
  const casterClasses = allClasses.filter((c) =>
    classifyCaster({ slug: c.slug, subclass: c.subclass ?? null } as DomainAppliedClass) !== 'none',
  );

  const raceCantripRef = character.data?.raceCantrip ?? null;

  // ── Race cantrip meta-fetch (unchanged) ───────────────────────────────────
  const [wizardCantripsResp, raceListResp] = await Promise.all([
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

  let raceCantripName: string | null = null;
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
    if (!raceName) {
      raceName = subraceRef?.slug ?? raceRef?.slug ?? null;
    }
  }

  // ── Branch: 0 casters ─────────────────────────────────────────────────────
  if (casterClasses.length === 0) {
    const primaryClass = allClasses[0]!;
    return (
      <section>
        <NumberedSectionHead
          num="05"
          title="Hechizos"
          meta="Paso 5 de 6"
          description="Elegí los hechizos de tu clase."
        />
        <div className="mt-6 space-y-4">
          <NoPicksPanel
            characterId={id}
            variant="non-caster"
            className={primaryClass.slug}
            level={primaryClass.level}
          />
        </div>
      </section>
    );
  }

  // ── Branch: 1 caster — direct fetch (REQ-SP06-MULTICLASS-PARALLEL-FETCH) ──
  if (casterClasses.length === 1) {
    const primaryClass = casterClasses[0]!;
    const options = await api.get<SpellOptionsResponse>(
      `/characters/${id}/classes/${primaryClass.slug}/spells/options`,
      token,
    );
    const { limits } = options;

    if (!hasPicks(limits)) {
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
            <NoPicksPanel
              characterId={id}
              variant="too-early"
              className={primaryClass.slug}
              level={primaryClass.level}
            />
          </div>
        </section>
      );
    }

    const initialPicks = character.data?.spells?.[primaryClass.slug] ?? {
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
          <SinglePickerView
            characterId={id}
            classSlug={primaryClass.slug}
            classSource={primaryClass.source}
            limits={limits}
            availableSpells={options.availableSpells}
            subclassGrantedSlugs={options.subclassGrantedSlugs}
            backHref={`/characters/${id}/wizard/background`}
            initialPicks={initialPicks}
          />
        </div>
      </section>
    );
  }

  // ── Branch: 2+ casters — parallel fetch (REQ-SP06-MULTICLASS-PARALLEL-FETCH) ─
  const optionsPerClass = await Promise.all(
    casterClasses.map((c) =>
      api.get<SpellOptionsResponse>(
        `/characters/${id}/classes/${c.slug}/spells/options`,
        token,
      ),
    ),
  );

  const casterTabData: CasterTabData[] = casterClasses.map((c, i) => {
    const opts = optionsPerClass[i]!;
    return {
      classSlug: c.slug,
      classSource: c.source,
      className: classLabel(c.slug),
      limits: opts.limits,
      availableSpells: opts.availableSpells,
      subclassGrantedSlugs: opts.subclassGrantedSlugs,
      initialPicks: character.data?.spells?.[c.slug] ?? {
        cantrips: [],
        known: [],
        prepared: [],
      },
    };
  });

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
        <MulticlassSpellsView
          characterId={id}
          casterClasses={casterTabData}
        />
      </div>
    </section>
  );
}
