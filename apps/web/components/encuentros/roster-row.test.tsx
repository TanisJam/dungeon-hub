import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RosterList } from './roster-row';
import type { EncounterCombatant } from './types';

const defaultEconomy = {
  conditions: [],
  effects: [],
  actionUsed: false,
  bonusActionUsed: false,
  reactionUsed: false,
  attacksRemaining: 1,
};

const combatants: EncounterCombatant[] = [
  { id: 'a', name: 'Mira',     kind: 'pc',  characterId: null, initiative: 18, hpCurrent: 22, hpMax: 22, insertionOrder: 0, ...defaultEconomy },
  { id: 'b', name: 'Goblin α', kind: 'npc', characterId: null, initiative: 15, hpCurrent: 0,  hpMax: 7,  insertionOrder: 1, ...defaultEconomy },
  { id: 'c', name: 'Brann',    kind: 'pc',  characterId: null, initiative: 13, hpCurrent: 28, hpMax: 32, insertionOrder: 2, ...defaultEconomy },
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

  it('PC vs NPC pill tone surfaced via data-tone (primary / accent)', () => {
    const { container } = render(
      <RosterList combatants={combatants} currentCombatantId="a" />,
    );
    const rows = Array.from(container.querySelectorAll('.encuentros-init-row'));
    const miraRow = rows.find((r) => r.getAttribute('data-combatant-id') === 'a')!;
    const goblinRow = rows.find((r) => r.getAttribute('data-combatant-id') === 'b')!;
    expect(miraRow.querySelector('[data-tone="primary"]')).not.toBeNull();
    expect(goblinRow.querySelector('[data-tone="accent"]')).not.toBeNull();
  });

  // REQ-WCO-WEB-04: action-economy indicators on own row only
  it('REQ-WCO-WEB-04a: action-economy indicators appear on own-combatant row when actionUsed: true', () => {
    const withActionUsed: EncounterCombatant[] = [
      { ...combatants[0]!, actionUsed: true },
      combatants[1]!,
    ];
    const { container } = render(
      <RosterList combatants={withActionUsed} currentCombatantId="a" ownCombatantId="a" />,
    );
    const miraRow = container.querySelector('[data-combatant-id="a"]')!;
    // own row shows action economy indicator
    expect(miraRow.querySelector('[data-action-economy]')).not.toBeNull();
  });

  it('REQ-WCO-WEB-04b: other combatant rows show no action-economy indicators', () => {
    const withActionUsed: EncounterCombatant[] = [
      { ...combatants[0]!, actionUsed: true },
      combatants[1]!,
    ];
    const { container } = render(
      <RosterList combatants={withActionUsed} currentCombatantId="a" ownCombatantId="a" />,
    );
    const goblinRow = container.querySelector('[data-combatant-id="b"]')!;
    // other row shows NO action economy indicator
    expect(goblinRow.querySelector('[data-action-economy]')).toBeNull();
  });

  // REQ-WCO-WEB-03: ConditionBadges rendered in roster row
  it('REQ-WCO-WEB-03e: condition badge "Prone" appears on a combatant row that has it', () => {
    const withCondition: EncounterCombatant[] = [
      {
        ...combatants[0]!,
        conditions: [{ name: 'Prone', appliedByCombatantId: null }],
      },
    ];
    const { container } = render(
      <RosterList combatants={withCondition} currentCombatantId="a" />,
    );
    const miraRow = container.querySelector('[data-combatant-id="a"]')!;
    expect(miraRow.textContent).toContain('Prone');
  });
});
