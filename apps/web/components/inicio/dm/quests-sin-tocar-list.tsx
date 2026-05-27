import { SectionHead } from '@/components/ui/section-head';
import type { QuestSinTocar } from '../dm-mock-data';

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
          <li
            key={quest.id}
            data-quest-row
            className="flex items-center gap-3 rounded-xl bg-surface-raised px-3 py-2.5"
          >
            {/* Magenta scroll icon-cell */}
            <span className="inicio-row-quest-ic flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-base">
              📜
            </span>

            {/* Title + lastChange */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{quest.title}</p>
              <p className="text-xs text-ink-mute mt-0.5">Último cambio: {quest.lastChange}</p>
            </div>

            {/* Chevron */}
            <span className="text-ink-mute text-base flex-shrink-0">›</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
