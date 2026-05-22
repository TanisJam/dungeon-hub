'use client';

import type { ReactNode } from 'react';
import type { PillTone } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { ChoiceCard } from './choice-card';

export interface ChoiceOption<K extends string> {
  key: K;
  title: string;
  /** @deprecated use subtitle */
  sub?: string;
  subtitle?: string;
  pills?: Array<{ tone?: PillTone; label: string }>;
  /** @deprecated use pills */
  metaPills?: Array<{ tone?: PillTone; label: string }>;
  iconName?: IconName;
  detail: ReactNode;
}

interface ChoiceListProps<K extends string> {
  options: ChoiceOption<K>[];
  selectedKey: K | null;
  onSelect: (key: K | null) => void;
}

export function ChoiceList<K extends string>({
  options,
  selectedKey,
  onSelect,
}: ChoiceListProps<K>) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const isSelected = opt.key === selectedKey;
        return (
          <ChoiceCard
            key={opt.key}
            id={opt.key}
            title={opt.title}
            subtitle={opt.subtitle ?? opt.sub}
            pills={opt.pills ?? opt.metaPills}
            iconName={opt.iconName}
            selected={isSelected}
            onClick={() => onSelect(isSelected ? null : opt.key)}
            detail={opt.detail}
          />
        );
      })}
    </div>
  );
}
