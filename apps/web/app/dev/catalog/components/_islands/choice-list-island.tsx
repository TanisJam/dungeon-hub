'use client';

import { useState } from 'react';
import { ChoiceList } from '@/components/wizard/choice-list';

type RaceKey = 'human' | 'elf' | 'dwarf' | 'halfling';

const FIXTURE_OPTIONS: import('@/components/wizard/choice-list').ChoiceOption<RaceKey>[] = [
  {
    key: 'human',
    title: 'Humano',
    subtitle: 'Versátil y ambicioso',
    pills: [{ label: '+1 a todos los atributos', tone: 'stone' }],
    iconName: 'user',
    detail: (
      <p className="text-xs text-ink-mute">
        Los humanos son los más extendidos en Faerûn. Reciben un +1 a todos sus atributos.
      </p>
    ),
  },
  {
    key: 'elf',
    title: 'Elfo',
    subtitle: 'Gracia, percepción y magia',
    pills: [
      { label: '+2 DES', tone: 'primary' },
      { label: 'Visión en la oscuridad', tone: 'stone' },
    ],
    iconName: 'sparkle',
    detail: (
      <p className="text-xs text-ink-mute">
        Los elfos tienen visión en la oscuridad y ventaja en tiradas contra encantamientos.
      </p>
    ),
  },
  {
    key: 'dwarf',
    title: 'Enano',
    subtitle: 'Resistencia y tradición',
    pills: [
      { label: '+2 CON', tone: 'accent' },
      { label: 'Resistencia enana', tone: 'stone' },
    ],
    iconName: 'shield',
    detail: (
      <p className="text-xs text-ink-mute">
        Los enanos tienen ventaja en tiradas de salvación contra veneno y resistencia al daño por veneno.
      </p>
    ),
  },
  {
    key: 'halfling',
    title: 'Mediano',
    subtitle: 'Suerte y agilidad',
    pills: [{ label: '+2 DES', tone: 'primary' }],
    iconName: 'heart',
    detail: (
      <p className="text-xs text-ink-mute">
        Los medianos pueden repetir 1s en ataques, tiradas de habilidad y salvaciones.
      </p>
    ),
  },
];

/**
 * Dev-only client island for ChoiceList.
 * Owns the selectedKey state so the registry (a server module) does not
 * need to pass onSelect across the server→client boundary.
 */
export function ChoiceListIsland() {
  const [selectedKey, setSelectedKey] = useState<RaceKey | null>(null);
  return (
    <ChoiceList
      options={FIXTURE_OPTIONS}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
    />
  );
}
