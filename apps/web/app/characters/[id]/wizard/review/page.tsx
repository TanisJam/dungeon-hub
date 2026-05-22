import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { ActivateForm } from './_activate-form';
import { Card } from '@/components/ui';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';

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

const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

const STAT_ES: Record<string, string> = {
  str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

const STEP_LABELS: Record<string, string> = {
  stats: 'Atributos',
  race: 'Linaje',
  class: 'Clase',
  background: 'Trasfondo',
};

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

  const primaryClass = d.classes?.[0] ?? null;

  const completeness = {
    stats: !!d.baseStats,
    race: !!d.race,
    class: !!primaryClass,
    background: !!d.background,
  };
  const allComplete = Object.values(completeness).every(Boolean);
  const alreadyActive = character.status === 'active';
  const alreadyPending = character.status === 'pending_approval';

  return (
    <section>
      <NumberedSectionHead
        num="05"
        title="Revisión"
        meta="Paso 5 de 5"
        description="Revisá tu personaje antes de enviarlo al DM."
      />
      {allComplete && (
        <div className="mb-4 -mt-2">
          <span className="inline-flex items-center gap-1 rounded-pill bg-primary-soft px-3 py-1 text-xs font-bold text-primary-deep">
            ✓ LISTO
          </span>
        </div>
      )}

      <div className="space-y-3">
        {/* Completeness overview */}
        <Card variant="surface" className="p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Completitud
          </p>
          <ul className="space-y-2">
            {(Object.keys(completeness) as Array<keyof typeof completeness>).map((step) => (
              <li key={step} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                      completeness[step]
                        ? 'bg-primary-soft text-primary-deep'
                        : 'bg-paper-soft text-ink-mute border border-line',
                    ].join(' ')}
                  >
                    {completeness[step] ? '✓' : '○'}
                  </span>
                  <span className={completeness[step] ? 'text-sm text-ink' : 'text-sm text-ink-mute'}>
                    {STEP_LABELS[step]}
                  </span>
                </div>
                {!completeness[step] && (
                  <Link
                    href={`/characters/${id}/wizard/${step}`}
                    className="text-xs text-primary-deep hover:underline"
                  >
                    Completar →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {/* Ability scores */}
        {baseStats && (
          <Card variant="surface" className="p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
              Atributos
            </p>
            <div className="grid grid-cols-3 gap-2">
              {STAT_KEYS.map((k) => {
                const base = baseStats[k];
                const final = finalStats?.[k] ?? base;
                const racial = final - base;
                return (
                  <div
                    key={k}
                    className="flex flex-col items-center rounded-md bg-paper-soft p-2 text-center"
                  >
                    <span className="text-[10px] font-bold text-ink-mute">{STAT_ES[k]}</span>
                    <span className="font-display text-xl font-bold text-ink leading-tight">{final}</span>
                    {racial !== 0 && (
                      <span className="text-[10px] text-primary-deep">
                        {racial > 0 ? `+${racial}` : racial} racial
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {d.statMethod && (
              <p className="mt-2 text-[10px] text-ink-mute">Método: {d.statMethod}</p>
            )}
          </Card>
        )}

        {/* Race */}
        {d.race && (
          <Card variant="surface" className="p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
              Linaje
            </p>
            <p className="text-sm text-ink">
              <span className="font-semibold">{d.race.slug}</span>
              <span className="text-ink-mute"> · {d.race.source}</span>
              {d.subrace && (
                <span className="text-ink-mute">
                  {' / '}
                  <span className="font-medium text-ink">{d.subrace.slug}</span>
                </span>
              )}
            </p>
          </Card>
        )}

        {/* Class */}
        {primaryClass && (
          <Card variant="surface" className="p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
              Clase
            </p>
            <p className="text-sm text-ink">
              <span className="font-semibold">{primaryClass.slug}</span>
              <span className="text-ink-mute"> · {primaryClass.source} · N{primaryClass.level}</span>
              {primaryClass.subclass && (
                <span className="text-ink-mute">
                  {' / '}<span className="text-ink">{primaryClass.subclass.slug}</span>
                </span>
              )}
            </p>
            {primaryClass.skillChoices?.length > 0 && (
              <p className="mt-1 text-xs text-ink-mute">
                Habilidades: {primaryClass.skillChoices.join(', ')}
              </p>
            )}
          </Card>
        )}

        {/* Background */}
        {d.background && (
          <Card variant="surface" className="p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
              Trasfondo
            </p>
            <p className="text-sm text-ink">
              <span className="font-semibold">{d.background.slug}</span>
              <span className="text-ink-mute"> · {d.background.source}</span>
            </p>
            {d.background.skills && d.background.skills.length > 0 && (
              <p className="mt-1 text-xs text-ink-mute">
                Habilidades: {d.background.skills.join(', ')}
              </p>
            )}
            {d.background.languages && d.background.languages.length > 0 && (
              <p className="text-xs text-ink-mute">
                Idiomas: {d.background.languages.join(', ')}
              </p>
            )}
            {d.background.tools && d.background.tools.length > 0 && (
              <p className="text-xs text-ink-mute">
                Herramientas: {d.background.tools.join(', ')}
              </p>
            )}
          </Card>
        )}
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
          <ActivateForm characterId={character.id} characterName={character.name} canActivate={allComplete} />
        )}
      </div>
    </section>
  );
}
