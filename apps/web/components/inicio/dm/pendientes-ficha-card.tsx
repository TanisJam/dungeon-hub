import { Pill } from '@/components/ui/pill';
import type { PendingFichaSummary } from '../dm-mock-data';
import { PendientesActionButtons } from './pendientes-action-buttons';

type Props = {
  ficha: PendingFichaSummary;
};

export function PendientesFichaCard({ ficha }: Props) {
  const rootClass = [
    'rounded-xl bg-surface-raised p-3 flex flex-col gap-3',
    ficha.fresh ? 'pendientes-card-fresh' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={rootClass}>
      <div className="flex items-start gap-3">
        <div className="pendientes-portrait text-lg font-display text-white">
          {ficha.pj.charAt(0)}
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <h3 className="font-display text-base text-ink leading-tight">{ficha.pj}</h3>
          <p className="italic text-sm text-ink-mute leading-tight">{ficha.lineage}</p>
          <div className="flex items-center gap-2 mt-1">
            <Pill tone="stone" size="sm">{ficha.player}</Pill>
            <Pill tone={ficha.fresh ? 'pink' : 'stone'} size="sm">
              enviada {ficha.sent}
            </Pill>
          </div>
        </div>
      </div>
      <PendientesActionButtons fichaId={ficha.id} />
    </article>
  );
}
