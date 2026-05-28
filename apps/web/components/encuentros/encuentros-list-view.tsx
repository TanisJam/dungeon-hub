import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
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
    return (
      <V3Empty
        glyph="sword"
        title="Esta sección es para DMs"
        sub="Cambiá a modo DM con el switcher de arriba para gestionar encuentros."
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
              <Pill size="sm" tone="pink">Ronda {encounter.round}</Pill>
              <Pill size="sm">{combatantsCount} combatientes</Pill>
              <Pill size="sm" tone={encounter.status === 'active' ? 'green' : 'stone'}>
                {encounter.status === 'active' ? 'Activo' : 'Cerrado'}
              </Pill>
            </div>
          </Link>
        ))
      )}
      <Link
        href="#"
        aria-disabled="true"
        className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line p-4 font-sans text-[13px] font-semibold text-ink-mute transition-colors hover:border-accent hover:text-accent"
        onClick={(e) => e.preventDefault()}
      >
        <span className="text-lg text-accent">+</span>
        <span>Iniciar encuentro nuevo</span>
      </Link>
    </div>
  );
}
