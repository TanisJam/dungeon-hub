import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { ActivateForm } from './_activate-form';
import { Card } from '@/components/ui';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';
import { ReviewBanner } from '@/components/wizard/review-banner';
import { NumberedReviewCard } from '@/components/wizard/numbered-review-card';
import { CharacterNameInput } from '@/components/wizard/character-name-input';
import { AbilityScoreGrid } from '@/components/sheet/ability-score-grid';
import type { AbilityKey } from '@/lib/sheet-types';

type AppliedClass = {
  slug: string;
  source: string;
  level: number;
  subclass: { slug: string; source: string } | null;
  hitDie: string;
  savingThrows: string[];
  skillChoices: string[];
};

type Character = {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  data: {
    baseStats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
    statMethod?: string;
    race?: { slug: string; source: string };
    subrace?: { slug: string; source: string } | null;
    asisApplied?: Array<{ ability: string; bonus: number; source: string }>;
    classes?: AppliedClass[];
    background?: {
      slug: string;
      source: string;
      skills?: string[];
      languages?: string[];
      tools?: string[];
    };
  } | null;
};

type Props = { params: Promise<{ id: string }> };

const STAT_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const STAT_METHOD_LABEL: Record<string, string> = {
  roll: 'Tirada',
  pointbuy: 'Puntos',
  standard: 'Estándar',
};

function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export default async function ReviewStepPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  const character = await api.get<Character>(`/characters/${id}`, session.access_token);
  const d = character.data ?? {};

  const baseStats = d.baseStats;
  const finalStats = baseStats ? { ...baseStats } : null;
  if (finalStats && d.asisApplied) {
    const stats = finalStats;
    for (const asi of d.asisApplied) {
      const k = asi.ability as keyof typeof stats;
      if (k in stats) stats[k] += asi.bonus;
    }
  }

  // Build ability score grid entries
  const abilityScores = finalStats
    ? (Object.fromEntries(
        STAT_KEYS.map((k) => [
          k,
          { score: finalStats[k], modifier: calcModifier(finalStats[k]) },
        ]),
      ) as Record<AbilityKey, { score: number; modifier: number }>)
    : null;

  const statTotal = finalStats
    ? STAT_KEYS.reduce((sum, k) => sum + finalStats[k], 0)
    : 0;

  const primaryClass = d.classes?.[0] ?? null;

  const completeness = {
    stats: !!d.baseStats,
    race: !!d.race,
    class: !!primaryClass,
    background: !!d.background,
  };
  const allComplete = Object.values(completeness).every(Boolean);
  const missingSteps = (Object.keys(completeness) as Array<keyof typeof completeness>).filter(
    (k) => !completeness[k],
  );
  const alreadyActive = character.status === 'active';
  const alreadyPending = character.status === 'pending_approval';

  // Banner pills
  const levelPill = primaryClass ? { label: `Nivel ${primaryClass.level}` } : undefined;
  const classPill = primaryClass ? { label: primaryClass.slug } : undefined;
  const subclassPill =
    primaryClass?.subclass ? { label: primaryClass.subclass.slug } : undefined;

  // Race summary pills
  const racePills = [];
  if (d.asisApplied && d.asisApplied.length > 0) {
    const groupedAsis: Record<string, number> = {};
    for (const asi of d.asisApplied) {
      groupedAsis[asi.ability] = (groupedAsis[asi.ability] ?? 0) + asi.bonus;
    }
    const asiLabel = Object.entries(groupedAsis)
      .map(([ab, bonus]) => `+${bonus} ${ab.toUpperCase()}`)
      .join(', ');
    if (asiLabel) racePills.push({ label: asiLabel });
  }

  // Class pills
  const classPills = [];
  if (primaryClass) {
    classPills.push({ label: `Hit Die: d${primaryClass.hitDie}` });
    if (primaryClass.savingThrows?.length) {
      classPills.push({ label: primaryClass.savingThrows.join(', ') });
    }
    if (primaryClass.skillChoices?.length) {
      classPills.push({ label: primaryClass.skillChoices.join(', ') });
    }
  }

  // Background pills
  const bgPills: { label: string }[] = [];
  if (d.background?.skills?.length) {
    bgPills.push({ label: d.background.skills.join(', ') });
  }
  if (d.background?.languages?.length) {
    bgPills.push({ label: d.background.languages.join(', ') });
  }

  const statMethodLabel = d.statMethod
    ? (STAT_METHOD_LABEL[d.statMethod] ?? d.statMethod)
    : null;

  const raceClassSummary = [d.race?.slug, primaryClass?.slug]
    .filter(Boolean)
    .join(' · ');

  return (
    <section>
      <NumberedSectionHead
        num="05"
        title="Revisión"
        meta="Paso 5 de 5"
        description="Revisá tu personaje antes de enviarlo al DM."
      />

      {/* Hero banner */}
      <ReviewBanner
        name={character.name}
        aventureroOf="Aventurero del Reposo"
        raceClassSummary={raceClassSummary || 'Personaje Incompleto'}
        levelPill={levelPill}
        classPill={classPill}
        subclassPill={subclassPill}
      />

      {/* Completeness warnings */}
      {!allComplete && (
        <div className="mb-4 space-y-1">
          {missingSteps.map((step) => (
            <div key={step} className="flex items-center justify-between rounded-md bg-warning-soft px-3 py-1.5">
              <span className="text-xs text-warning-deep">
                Paso incompleto: <strong>{step}</strong>
              </span>
              <Link
                href={`/characters/${id}/wizard/${step}`}
                className="text-xs text-warning-deep underline"
              >
                Completar →
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {/* Atributos section */}
        {abilityScores && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-display font-semibold text-[15px] text-ink">Atributos</span>
              <Link
                href={`/characters/${id}/wizard/stats`}
                className="text-[11px] text-ink-mute hover:text-ink transition-colors"
              >
                ✎ Editar
              </Link>
            </div>
            <Card variant="surface" className="p-4">
              <AbilityScoreGrid scores={abilityScores} />
              {statMethodLabel && (
                <p className="mt-2.5 text-[10px] text-ink-mute text-center">
                  Método: {statMethodLabel} · Total {statTotal}
                </p>
              )}
            </Card>
          </div>
        )}

        {/* Linaje (race) */}
        {d.race && (
          <NumberedReviewCard
            num="02"
            title={d.subrace ? `${d.race.slug} — ${d.subrace.slug}` : d.race.slug}
            subtitle={d.race.source}
            pills={racePills}
            editHref={`/characters/${id}/wizard/race`}
          />
        )}

        {/* Clase */}
        {primaryClass && (
          <NumberedReviewCard
            num="03"
            title={
              primaryClass.subclass
                ? `${primaryClass.slug} / ${primaryClass.subclass.slug}`
                : primaryClass.slug
            }
            subtitle={`${primaryClass.source} · Nivel ${primaryClass.level}`}
            pills={classPills}
            editHref={`/characters/${id}/wizard/class`}
          />
        )}

        {/* Trasfondo */}
        {d.background && (
          <NumberedReviewCard
            num="04"
            title={d.background.slug}
            subtitle={d.background.source}
            pills={bgPills}
            editHref={`/characters/${id}/wizard/background`}
          />
        )}

        {/* Character name input */}
        <CharacterNameInput characterId={character.id} initialName={character.name} />
      </div>

      {/* Activate / pending / already-active */}
      <div className="mt-6">
        {alreadyActive ? (
          <Card variant="surface" className="flex items-center justify-between p-4">
            <p className="text-sm text-primary-deep">✓ Este personaje ya está activo.</p>
            <Link href="/dashboard" className="text-sm text-primary-deep hover:underline">
              Inicio →
            </Link>
          </Card>
        ) : alreadyPending ? (
          <Card variant="surface" className="p-4 text-center">
            <p className="text-sm font-semibold text-warning-deep">
              Ya enviado al DM — esperando aprobación
            </p>
            <p className="mt-1 text-xs text-ink-mute">
              Tu personaje está en revisión. Te avisaremos cuando sea aprobado.
            </p>
          </Card>
        ) : (
          <ActivateForm
            characterId={character.id}
            characterName={character.name}
            raceLabel={d.subrace ? `${d.race?.slug} — ${d.subrace.slug}` : d.race?.slug}
            classLabel={primaryClass?.slug}
            level={primaryClass?.level ?? 1}
            canActivate={allComplete}
          />
        )}
      </div>
    </section>
  );
}
