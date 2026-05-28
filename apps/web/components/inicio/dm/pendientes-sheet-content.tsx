import { SectionHead } from '@/components/ui/section-head';
import type { PendingFichaSummary, QuestSinTocar } from '../dm-mock-data';
import { PendientesFichaCard } from './pendientes-ficha-card';

type Props = {
  fichas: PendingFichaSummary[];
  quests: QuestSinTocar[];
};

export function PendientesSheetContent({ fichas, quests }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionHead title="Fichas a aprobar" meta={fichas.length} />
        <div className="mt-2 flex flex-col gap-3">
          {fichas.map((f) => (
            <PendientesFichaCard key={f.id} ficha={f} />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Quests pendientes" meta={quests.length} />
        <ul className="mt-2 flex flex-col gap-2">
          {quests.map((quest) => (
            <li
              key={quest.id}
              data-quest-row
              className="flex items-center gap-3 rounded-xl bg-surface-raised px-3 py-2.5"
            >
              <span className="inicio-row-quest-ic flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-base">
                📜
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{quest.title}</p>
                <p className="text-xs text-ink-mute mt-0.5">Último cambio: {quest.lastChange}</p>
              </div>
              <span className="text-ink-mute text-base flex-shrink-0">›</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
