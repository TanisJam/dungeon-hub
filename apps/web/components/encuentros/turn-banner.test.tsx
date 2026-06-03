import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TurnBanner } from './turn-banner';

describe('TurnBanner', () => {
  // REQ-WCO-WEB-02: own turn → "Tu turno" + animate-pulse
  it('REQ-WCO-WEB-02a: own turn shows "Tu turno" with pulse class', () => {
    const { container, getByText } = render(
      <TurnBanner
        currentCombatantId="c1"
        ownCombatantId="c1"
        currentCombatantName="Mira"
      />,
    );
    expect(getByText('Tu turno')).toBeTruthy();
    // pulse indicator present in DOM
    const pulsed = container.querySelector('.animate-pulse');
    expect(pulsed).not.toBeNull();
  });

  // REQ-WCO-WEB-02: other's turn → "Turno de {name}", no pulse
  it('REQ-WCO-WEB-02b: other combatant turn shows "Turno de Goblin Guard" without pulse', () => {
    const { container, getByText } = render(
      <TurnBanner
        currentCombatantId="c2"
        ownCombatantId="c1"
        currentCombatantName="Goblin Guard"
      />,
    );
    expect(getByText('Turno de Goblin Guard')).toBeTruthy();
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  // ownCombatantId null → never shows "Tu turno" (spectator / GM)
  it('REQ-WCO-WEB-02c: null ownCombatantId shows "Turno de {name}" without pulse', () => {
    const { container, getByText } = render(
      <TurnBanner
        currentCombatantId="c2"
        ownCombatantId={null}
        currentCombatantName="Goblin Guard"
      />,
    );
    expect(getByText('Turno de Goblin Guard')).toBeTruthy();
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });
});
