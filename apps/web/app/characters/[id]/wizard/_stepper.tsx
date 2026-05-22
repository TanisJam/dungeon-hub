'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

const STEPS = [
  { segment: 'stats', label: 'Stats' },
  { segment: 'race', label: 'Race' },
  { segment: 'class', label: 'Class' },
  { segment: 'background', label: 'Background' },
  { segment: 'review', label: 'Review' },
] as const;

export function Stepper({ characterId }: { characterId: string }) {
  const active = useSelectedLayoutSegment();

  return (
    <ol className="mt-6 flex flex-wrap gap-x-2 gap-y-2 text-xs">
      {STEPS.map((step, i) => {
        const isActive = active === step.segment;
        return (
          <li key={step.segment} className="flex items-center gap-2">
            <Link
              href={`/characters/${characterId}/wizard/${step.segment}`}
              className={`inline-flex items-center gap-1.5 rounded px-2 py-1 ring-1 ring-inset transition ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30'
                  : 'text-zinc-400 ring-zinc-800 hover:text-zinc-200 hover:ring-zinc-700'
              }`}
            >
              <span className="font-mono text-[10px] opacity-60">{i + 1}</span>
              {step.label}
            </Link>
            {i < STEPS.length - 1 && <span className="text-zinc-700">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
