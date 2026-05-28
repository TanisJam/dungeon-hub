import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RosterList } from './roster-row';
import type { EncounterCombatant } from './types';

const combatants: EncounterCombatant[] = [
  { id: 'a', name: 'Mira',     kind: 'pc',  characterId: null, initiative: 18, hpCurrent: 22, hpMax: 22, insertionOrder: 0 },
  { id: 'b', name: 'Goblin α', kind: 'npc', characterId: null, initiative: 15, hpCurrent: 0,  hpMax: 7,  insertionOrder: 1 },
  { id: 'c', name: 'Brann',    kind: 'pc',  characterId: null, initiative: 13, hpCurrent: 28, hpMax: 32, insertionOrder: 2 },
];

describe('RosterList', () => {
  it('WED-ROSTER-LIST-04: rows ordered initiative DESC; dead row has .dead class', () => {
    const { container } = render(
      <RosterList combatants={combatants} currentCombatantId="a" />,
    );
    const rows = Array.from(container.querySelectorAll('.encuentros-init-row'));
    expect(rows.map((r) => r.getAttribute('data-combatant-id'))).toEqual(['a', 'b', 'c']);
    const goblinRow = rows.find((r) => r.getAttribute('data-combatant-id') === 'b');
    expect(goblinRow?.classList.contains('dead')).toBe(true);
  });

  it('PC vs NPC pill tone surfaced via data-tone (green / pink)', () => {
    const { container } = render(
      <RosterList combatants={combatants} currentCombatantId="a" />,
    );
    const rows = Array.from(container.querySelectorAll('.encuentros-init-row'));
    const miraRow = rows.find((r) => r.getAttribute('data-combatant-id') === 'a')!;
    const goblinRow = rows.find((r) => r.getAttribute('data-combatant-id') === 'b')!;
    expect(miraRow.querySelector('[data-tone="green"]')).not.toBeNull();
    expect(goblinRow.querySelector('[data-tone="pink"]')).not.toBeNull();
  });
});
