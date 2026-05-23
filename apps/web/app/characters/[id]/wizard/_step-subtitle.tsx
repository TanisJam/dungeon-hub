'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

const STEPS = ['stats', 'race', 'class', 'background', 'spells', 'review'] as const;

export function StepSubtitle() {
  const seg = useSelectedLayoutSegment();
  const idx = STEPS.indexOf(seg as (typeof STEPS)[number]) + 1;
  return <>{idx > 0 ? `PASO ${idx} DE 6` : 'CONSTRUCTOR'}</>;
}
