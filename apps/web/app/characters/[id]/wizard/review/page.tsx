import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { ActivateForm } from './_activate-form';

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
    for (const asi of d.asisApplied) {
      const k = asi.ability as keyof typeof finalStats;
      if (k in finalStats) finalStats[k] += asi.bonus;
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

  return (
    <section>
      <h2 className="text-lg font-semibold">Review</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Last look before activating your character.
      </p>

      <div className="mt-6 space-y-4">
        <Card title="Completeness">
          <ul className="space-y-1 text-sm">
            <CheckItem ok={completeness.stats} label="Stats" />
            <CheckItem ok={completeness.race} label="Race" />
            <CheckItem ok={completeness.class} label="Class" />
            <CheckItem ok={completeness.background} label="Background" />
          </ul>
        </Card>

        {baseStats && (
          <Card title="Ability Scores">
            <table className="w-full max-w-sm text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-zinc-500">
                  <th className="pb-1.5 text-left font-medium">Ability</th>
                  <th className="pb-1.5 text-right font-medium">Base</th>
                  <th className="pb-1.5 text-right font-medium">Racial</th>
                  <th className="pb-1.5 text-right font-medium">Final</th>
                </tr>
              </thead>
              <tbody>
                {STAT_KEYS.map((k) => {
                  const base = baseStats[k];
                  const final = finalStats?.[k] ?? base;
                  const racial = final - base;
                  return (
                    <tr key={k} className="border-t border-zinc-800/60">
                      <td className="py-1.5 font-mono text-zinc-400">{k.toUpperCase()}</td>
                      <td className="py-1.5 text-right font-mono">{base}</td>
                      <td className="py-1.5 text-right font-mono text-zinc-500">
                        {racial > 0 ? `+${racial}` : racial === 0 ? '—' : racial}
                      </td>
                      <td className="py-1.5 text-right font-mono text-zinc-100">{final}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {d.statMethod && (
              <p className="mt-3 text-xs text-zinc-500">Method: {d.statMethod}</p>
            )}
          </Card>
        )}

        {d.race && (
          <Card title="Race">
            <p className="text-sm">
              <span className="font-medium">{d.race.slug}</span>
              <span className="text-zinc-500"> · {d.race.source}</span>
              {d.subrace && (
                <span className="text-zinc-500">
                  {' '}
                  / subrace <span className="font-medium text-zinc-300">{d.subrace.slug}</span>
                </span>
              )}
            </p>
          </Card>
        )}

        {primaryClass && (
          <Card title="Class">
            <p className="text-sm">
              <span className="font-medium">{primaryClass.slug}</span>
              <span className="text-zinc-500">
                {' '}
                · {primaryClass.source} · L{primaryClass.level}
              </span>
              {primaryClass.subclass && (
                <span className="text-zinc-500">
                  {' '}
                  / <span className="text-zinc-300">{primaryClass.subclass.slug}</span>
                </span>
              )}
            </p>
            {primaryClass.skillChoices?.length > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                Skills: {primaryClass.skillChoices.join(', ')}
              </p>
            )}
          </Card>
        )}

        {d.background && (
          <Card title="Background">
            <p className="text-sm">
              <span className="font-medium">{d.background.slug}</span>
              <span className="text-zinc-500"> · {d.background.source}</span>
            </p>
            {d.background.skills && d.background.skills.length > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                Skills: {d.background.skills.join(', ')}
              </p>
            )}
            {d.background.languages && d.background.languages.length > 0 && (
              <p className="text-xs text-zinc-500">
                Languages: {d.background.languages.join(', ')}
              </p>
            )}
            {d.background.tools && d.background.tools.length > 0 && (
              <p className="text-xs text-zinc-500">
                Tools: {d.background.tools.join(', ')}
              </p>
            )}
          </Card>
        )}
      </div>

      <div className="mt-8">
        {alreadyActive ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <p className="text-sm text-emerald-300">✓ This character is already active.</p>
            <Link href="/dashboard" className="text-sm text-emerald-300 hover:text-emerald-200">
              Dashboard →
            </Link>
          </div>
        ) : (
          <ActivateForm characterId={character.id} canActivate={allComplete} />
        )}
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? 'text-emerald-400' : 'text-zinc-600'}>{ok ? '✓' : '○'}</span>
      <span className={ok ? 'text-zinc-200' : 'text-zinc-500'}>{label}</span>
    </li>
  );
}
