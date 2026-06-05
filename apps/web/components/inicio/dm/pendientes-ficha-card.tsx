import { Pill } from '@/components/ui/pill';
import { CharacterPortrait } from '@/components/ui/character-portrait';
import type { PendingFichaSummary } from '../types';
import { PendientesActionButtons } from './pendientes-action-buttons';
import type { PendientesActions } from './pendientes-action-buttons';

type Props = {
  ficha: PendingFichaSummary;
  /** Injectable approve/reject handlers; omitted → real server actions. */
  actions?: PendientesActions;
};

export function PendientesFichaCard({ ficha, actions }: Props) {
  const rootClass = [
    'rounded-xl bg-surface-raised p-3 flex flex-col gap-3',
    ficha.fresh ? 'pendientes-card-fresh' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={rootClass}>
      <div className="flex items-start gap-3">
        <CharacterPortrait name={ficha.pj} size="sm" />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <h3 className="font-display text-base text-ink leading-tight">{ficha.pj}</h3>
          <p className="italic text-sm text-ink-mute leading-tight">{ficha.lineage}</p>
          <div className="flex items-center gap-2 mt-1">
            <Pill tone="stone" size="sm">{ficha.player}</Pill>
            <Pill tone={ficha.fresh ? 'accent' : 'stone'} size="sm">
              enviada {ficha.sent}
            </Pill>
          </div>
        </div>
      </div>
      <PendientesActionButtons fichaId={ficha.id} actions={actions} />
    </article>
  );
}
