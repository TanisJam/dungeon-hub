import { SectionHead } from '@/components/ui/section-head';
import { QuestRow } from '@/components/ui/quest-row';
import type { PendingFichaSummary, QuestSinTocar } from '../types';
import { PendientesFichaCard } from './pendientes-ficha-card';
import type { PendientesActions } from './pendientes-action-buttons';

type Props = {
  fichas: PendingFichaSummary[];
  quests: QuestSinTocar[];
  /** Injectable approve/reject handlers; omitted → real server actions. */
  actions?: PendientesActions;
};

export function PendientesSheetContent({ fichas, quests, actions }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionHead title="Fichas a aprobar" meta={fichas.length} />
        <div className="mt-2 flex flex-col gap-3">
          {fichas.map((f) => (
            <PendientesFichaCard key={f.id} ficha={f} actions={actions} />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Quests pendientes" meta={quests.length} />
        <ul className="mt-2 flex flex-col gap-2">
          {quests.map((quest) => (
            <QuestRow
              key={quest.id}
              title={quest.title}
              subtitle={`Último cambio: ${quest.lastChange}`}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
