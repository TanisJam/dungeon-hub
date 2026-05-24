import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';
import { NoPicksPanel } from './_no-picks-panel';
import { SpellsPicker } from './_picker';

// ── Types ──────────────────────────────────────────────────────────────────

type SpellRef = { slug: string; source: string };

type AppliedClass = {
  slug: string;
  source: string;
  level: number;
  subclass?: { slug: string; source: string } | null;
};

type Character = {
  id: string;
  campaignId: string;
  data: {
    classes?: AppliedClass[];
    spells?: Record<string, { cantrips: SpellRef[]; known: SpellRef[]; prepared: SpellRef[] }>;
    raceCantrip?: { slug: string; source: string } | null;
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

  const options = await api.get<SpellOptionsResponse>(
    `/characters/${id}/classes/${primaryClass.slug}/spells/options`,
    token,
  );

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

      <div className="mt-6">
        {!needsPicks ? (
          <NoPicksPanel
            characterId={id}
            variant={nonCaster ? 'non-caster' : 'too-early'}
            className={primaryClass.slug}
            level={primaryClass.level}
            hasRaceCantrip={!!character.data?.raceCantrip}
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
            highElfWizardNotice={!!character.data?.raceCantrip}
          />
        )}
      </div>
    </section>
  );
}
