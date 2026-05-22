'use client';

import type { ReactNode } from 'react';
import type { PillTone } from '@/components/ui';
import { ChoiceCard } from './choice-card';

export interface ChoiceOption<K extends string> {
  key: K;
  title: string;
  sub?: string;
  metaPills?: Array<{ tone?: PillTone; label: string }>;
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
            title={opt.title}
            sub={opt.sub}
            metaPills={opt.metaPills}
            selected={isSelected}
            onClick={() => onSelect(isSelected ? null : opt.key)}
          >
            {opt.detail}
          </ChoiceCard>
        );
      })}
    </div>
  );
}
