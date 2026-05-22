import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { StatsForm } from './_form';

type StatGen = { standardArray: boolean; pointBuy: boolean; roll: boolean };

type Character = {
  id: string;
  campaignId: string;
  data: {
    baseStats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
    statMethod?: 'standard-array' | 'point-buy' | 'roll';
  } | null;
};

type Campaign = { id: string; rulesProfile: { statGeneration: StatGen } };

type Props = { params: Promise<{ id: string }> };

export default async function StatsStepPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  const character = await api.get<Character>(`/characters/${id}`, session.access_token);
  const campaign = await api.get<Campaign>(
    `/campaigns/${character.campaignId}`,
    session.access_token,
  );

  const allowed = campaign.rulesProfile.statGeneration;
  const allowedMethods: Array<'standard-array' | 'point-buy' | 'roll'> = [];
  if (allowed.standardArray) allowedMethods.push('standard-array');
  if (allowed.pointBuy) allowedMethods.push('point-buy');
  if (allowed.roll) allowedMethods.push('roll');

  return (
    <section>
      <h2 className="font-display text-xl font-bold text-ink">Atributos</h2>
      <p className="mt-1 text-sm text-ink-mute">
        Elegí tus seis atributos base. Los bonificadores raciales se aplican en el paso siguiente.
      </p>

      <div className="mt-6">
        <StatsForm
          characterId={id}
          allowedMethods={allowedMethods}
          initialMethod={character.data?.statMethod ?? allowedMethods[0] ?? 'point-buy'}
          initialScores={character.data?.baseStats ?? null}
        />
      </div>
    </section>
  );
}
