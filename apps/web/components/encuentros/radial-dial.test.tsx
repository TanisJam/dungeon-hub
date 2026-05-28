import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RadialDial } from './radial-dial';
import type { EncounterCombatant } from './types';

const combatants: EncounterCombatant[] = [
  { id: 'a', name: 'Mira',     kind: 'pc',  characterId: null, initiative: 18, hpCurrent: 22, hpMax: 22, insertionOrder: 0 },
  { id: 'b', name: 'Goblin α', kind: 'npc', characterId: null, initiative: 15, hpCurrent: 5,  hpMax: 7,  insertionOrder: 1 },
  { id: 'c', name: 'Brann',    kind: 'pc',  characterId: null, initiative: 13, hpCurrent: 28, hpMax: 32, insertionOrder: 2 },
  { id: 'd', name: 'Thorgar',  kind: 'pc',  characterId: null, initiative: 11, hpCurrent: 52, hpMax: 52, insertionOrder: 3 },
  { id: 'e', name: 'Goblin β', kind: 'npc', characterId: null, initiative: 8,  hpCurrent: 0,  hpMax: 7,  insertionOrder: 4 },
];

describe('RadialDial', () => {
  it('WED-RADIAL-RENDER-01: one .encuentros-init-token per combatant; exactly one .current marker', () => {
    const { container } = render(
      <RadialDial combatants={combatants} currentCombatantId="b" />,
    );
    // WED-CSS-SCOPED-05: outer container has .encuentros-init
    expect(container.querySelector('.encuentros-init')).not.toBeNull();
    const tokens = container.querySelectorAll('.encuentros-init-token');
    expect(tokens.length).toBe(combatants.length);
    const currents = container.querySelectorAll('.encuentros-init-token.current');
    expect(currents.length).toBe(1);
    expect(currents[0]?.getAttribute('data-combatant-id')).toBe('b');
  });

  it('WED-CENTER-HP-02: center shows name, initiative, HP X/Y, and fill bar width matches ratio', () => {
    const { container, getByText } = render(
      <RadialDial combatants={combatants} currentCombatantId="b" />,
    );
    expect(getByText('Goblin α')).toBeTruthy();
    expect(getByText(/Iniciativa 15.*HP 5\/7/)).toBeTruthy();
    const fill = container.querySelector<HTMLElement>('.encuentros-init-center .fill');
    expect(fill).not.toBeNull();
    // 5/7 ≈ 71.43%
    expect(fill!.style.width).toMatch(/71/);
  });
});
