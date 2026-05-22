'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { Icon } from '@/components/ui/icon';

const STEPS = [
  { segment: 'stats',      label: 'Atributos' },
  { segment: 'race',       label: 'Linaje' },
  { segment: 'class',      label: 'Clase' },
  { segment: 'background', label: 'Trasfondo' },
  { segment: 'review',     label: 'Revisión' },
] as const;

type Step = typeof STEPS[number];

function statusOf(step: Step, activeSegment: string | null): 'active' | 'done' | 'pending' {
  const activeIdx = STEPS.findIndex((s) => s.segment === activeSegment);
  const thisIdx = STEPS.findIndex((s) => s.segment === step.segment);
  if (thisIdx === activeIdx) return 'active';
  if (thisIdx < activeIdx) return 'done';
  return 'pending';
}

export function Stepper({ characterId }: { characterId: string }) {
  const active = useSelectedLayoutSegment();

  return (
    <nav aria-label="Pasos del personaje">
      <ol className="flex items-center gap-1.5">
        {STEPS.map((step, i) => {
          const state = statusOf(step, active);
          const isActive = state === 'active';
          const done = state === 'done';

          return (
            <li key={step.segment} className="flex items-center gap-1.5 shrink-0">
              <Link
                href={`/characters/${characterId}/wizard/${step.segment}`}
                aria-current={isActive ? 'step' : undefined}
                aria-label={step.label}
                className={[
                  'inline-flex items-center transition-all',
                  // Active: pill expandida con label
                  isActive
                    ? 'gap-2 rounded-pill bg-ink pl-1 pr-3 py-1 text-paper shadow-stamp-sm'
                    : // Done / Pending: circle solo con número
                      'h-7 w-7 justify-center rounded-pill text-xs font-semibold',
                  !isActive && done
                    ? 'bg-primary-soft text-primary-deep'
                    : '',
                  !isActive && !done
                    ? 'bg-surface text-ink-mute border border-line hover:text-ink-soft'
                    : '',
                ].join(' ')}
              >
                {isActive ? (
                  <>
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-accent text-[10px] font-bold text-ink">
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold">{step.label}</span>
                  </>
                ) : done ? (
                  <Icon name="check" size={14} className="text-primary-deep" strokeWidth={2.5} />
                ) : (
                  <span>{i + 1}</span>
                )}
              </Link>
              {i < STEPS.length - 1 && (
                <span className="text-line text-xs select-none">›</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
