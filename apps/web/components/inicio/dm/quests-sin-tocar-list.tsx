import { SectionHead } from '@/components/ui/section-head';
import { QuestRow } from '@/components/ui/quest-row';
import type { QuestSinTocar } from '../types';

interface QuestsSinTocarListProps {
  quests: QuestSinTocar[];
}

/**
 * QuestsSinTocarList — list of quests that haven't been touched recently.
 *
 * REQ-IDM-QUESTS-LIST-06
 */
export function QuestsSinTocarList({ quests }: QuestsSinTocarListProps) {
  return (
    <section>
      <SectionHead title="Quests sin tocar" meta={quests.length > 0 ? String(quests.length) : undefined} />
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
  );
}
