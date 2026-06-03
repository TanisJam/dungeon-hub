import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ConditionBadges } from './condition-badges';

describe('ConditionBadges', () => {
  // REQ-WCO-WEB-03: condition badge rendered for each name
  // PHB Appendix A p.291: Stunned condition
  it('REQ-WCO-WEB-03a: conditions ["Stunned"] → badge with text "Stunned"', () => {
    const { getByText } = render(
      <ConditionBadges conditions={['Stunned']} effects={[]} />,
    );
    expect(getByText('Stunned')).toBeTruthy();
  });

  // PHB p.219: Bless effect
  it('REQ-WCO-WEB-03b: effects ["Bless"] → badge with text "Bless"', () => {
    const { getByText } = render(
      <ConditionBadges conditions={[]} effects={['Bless']} />,
    );
    expect(getByText('Bless')).toBeTruthy();
  });

  // REQ-WCO-WEB-03: empty → nothing rendered
  it('REQ-WCO-WEB-03c: empty arrays → no badges rendered', () => {
    const { container } = render(
      <ConditionBadges conditions={[]} effects={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // Multiple conditions rendered
  it('REQ-WCO-WEB-03d: multiple conditions render all badges (PHB Appendix A p.290-292)', () => {
    const { getByText } = render(
      <ConditionBadges conditions={['Prone', 'Grappled']} effects={['Hex']} />,
    );
    // PHB Appendix A p.290: Prone; p.290: Grappled; PHB p.251: Hex
    expect(getByText('Prone')).toBeTruthy();
    expect(getByText('Grappled')).toBeTruthy();
    expect(getByText('Hex')).toBeTruthy();
  });
});
