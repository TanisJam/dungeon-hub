import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { DashedCTA } from '@/components/ui/dashed-cta';
import { V3Empty } from '@/components/ui/empty';
import type { EncounterSummary } from './types';

export type EncuentroRow = {
  encounter: EncounterSummary;
  campaignName: string;
  combatantsCount: number;
};

type Props = {
  role: string;
  rows: EncuentroRow[];
};

export function EncuentrosListView({ role, rows }: Props) {
  if (role !== 'dm') {
    // REQ-DPPMC-ENCUENTROS-04: useful player state (not a dead-end).
    // Combat is FROZEN — no combat UI. Point the player to their active sessions.
    return (
      <V3Empty
        glyph="scroll"
        title="Los combates los maneja tu DM"
        sub="Cuando estés en una sesión activa vas a ver acá lo que pase en la mesa."
        cta={{ label: 'Ir a mis sesiones', href: '/inicio' }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <V3Empty
          glyph="sword"
          title="Sin encuentros activos"
          sub="Cuando inicies un encuentro va a aparecer acá."
        />
      ) : (
        rows.map(({ encounter, campaignName, combatantsCount }) => (
          <Link
            key={encounter.id}
            href={`/encuentros/${encounter.id}`}
            className="flex flex-col gap-1.5 rounded-md border border-line bg-surface p-3 transition-colors hover:border-ink-mute"
          >
            <div className="font-display text-base font-bold text-ink">{encounter.name}</div>
            <div className="font-sans text-xs italic text-ink-mute">{campaignName}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Pill size="sm" tone="accent">Ronda {encounter.round}</Pill>
              <Pill size="sm">{combatantsCount} combatientes</Pill>
              <Pill size="sm" tone={encounter.status === 'active' ? 'primary' : 'stone'}>
                {encounter.status === 'active' ? 'Activo' : 'Cerrado'}
              </Pill>
            </div>
          </Link>
        ))
      )}
      <DashedCTA disabled title="Próximamente">
        <span className="text-lg text-accent">+</span>
        <span>Iniciar encuentro nuevo</span>
      </DashedCTA>
    </div>
  );
}
