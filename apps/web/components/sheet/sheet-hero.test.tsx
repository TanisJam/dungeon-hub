
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SheetHero } from './sheet-hero';

const defaultProps = {
  name: 'Brann',
  level: 5,
  xpCurrent: 6500,
  xpNextThreshold: 14000,
};

describe('SheetHero', () => {
  it('T1: hero container has class ficha-hero-bg', () => {
    const { container } = render(<SheetHero {...defaultProps} />);
    const heroDiv = container.firstElementChild as HTMLElement;
    expect(heroDiv.className).toContain('ficha-hero-bg');
  });

  it('T2: portrait ring container has class ficha-portrait-ring', () => {
    const { container } = render(<SheetHero {...defaultProps} />);
    const portrait = container.querySelector('.ficha-portrait-ring');
    expect(portrait).toBeTruthy();
  });

  it('T3: classes prop shows all class pills for multiclass character', () => {
    // REQ-HERO-02: multiclass barb5/monk2 — both class slugs appear as pills.
    // REQ-HERO-04: derivation uses ALL identity.classes, not just [0].
    const { getByText } = render(
      <SheetHero
        {...defaultProps}
        classes={[
          { slug: 'barbarian', level: 5, subclass: null },
          { slug: 'monk', level: 2, subclass: null },
        ]}
      />,
    );
    // Both class+level pills must be present.
    expect(getByText('barbarian 5')).toBeTruthy();
    expect(getByText('monk 2')).toBeTruthy();
  });

  it('T4: single-class regression — classes=[wizard L3 + subclass] renders class and subclass pills', () => {
    // REQ-HERO-08: for a single-class character, classes prop and classLabel/subclassLabel path
    // must produce the same visual output (class pill + subclass pill).
    const { getByText } = render(
      <SheetHero
        {...defaultProps}
        classes={[
          { slug: 'wizard', level: 3, subclass: { slug: 'wizard--evocation' } },
        ]}
      />,
    );
    expect(getByText('wizard 3')).toBeTruthy();
    expect(getByText('wizard--evocation')).toBeTruthy();
  });
});
