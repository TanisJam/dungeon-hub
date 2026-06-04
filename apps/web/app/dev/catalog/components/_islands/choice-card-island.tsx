'use client';

import { useState } from 'react';
import { ChoiceCard } from '@/components/wizard/choice-card';
import type { IconName } from '@/components/ui';

/**
 * Dev-only client island for ChoiceCard.
 * Owns the selected toggle state so the registry (a server module) does not
 * need to pass onClick/selected across the server→client boundary.
 */
export function ChoiceCardIsland(props: {
  id?: string;
  title: string;
  subtitle?: string;
  iconName?: IconName;
  initialSelected?: boolean;
}) {
  const [selected, setSelected] = useState(props.initialSelected ?? false);
  return (
    <ChoiceCard
      id={props.id}
      title={props.title}
      subtitle={props.subtitle}
      iconName={props.iconName ?? 'sparkle'}
      selected={selected}
      onClick={() => setSelected((v) => !v)}
    />
  );
}
