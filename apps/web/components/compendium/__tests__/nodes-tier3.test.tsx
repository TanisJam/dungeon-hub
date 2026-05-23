import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EntryNodeRenderer } from '../index';

function refAttr(html: string): string | null {
  const m = html.match(/data-compendium-ref="([^"]+)"/);
  return m?.[1] ?? null;
}

describe('statblock nodes', () => {
  it('renders <a> link with data-compendium-ref', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'statblock', tag: 'creature', name: 'Goblin', source: 'MM' }}
      />,
    );
    expect(container.querySelector('a')).not.toBeNull();
    expect(refAttr(container.innerHTML)).toBe('creature|goblin|MM');
    expect(container.textContent).toBe('Goblin');
  });

  it('defaults tag to creature when missing', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'statblock', name: 'Mystery', source: 'MM' }}
      />,
    );
    expect(refAttr(container.innerHTML)).toBe('creature|mystery|MM');
  });

  it('statblockInline without name/source falls back gracefully', () => {
    const { container } = render(
      <EntryNodeRenderer entry={{ type: 'statblockInline' }} />,
    );
    expect(container.textContent).toContain('inline stat block');
  });
});

describe('refXxxFeature nodes', () => {
  it('refClassFeature parses pipe string and uses ClassSrc (index 2) as source', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'refClassFeature', classFeature: 'Action Surge|Fighter|PHB|2' }}
      />,
    );
    expect(refAttr(container.innerHTML)).toBe('classFeature|action-surge|PHB');
    expect(container.textContent).toBe('Action Surge');
  });

  it('refSubclassFeature uses subclassSrc (index 4) when index 6 missing', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'refSubclassFeature',
          subclassFeature: 'Wild Shape|Druid|PHB|Circle of the Moon|PHB|2',
        }}
      />,
    );
    expect(refAttr(container.innerHTML)).toBe('subclassFeature|wild-shape|PHB');
  });

  it('refOptionalfeature parses simple name|source', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'refOptionalfeature', optionalfeature: 'Eldritch Spear|XGE' }}
      />,
    );
    expect(refAttr(container.innerHTML)).toBe('optfeature|eldritch-spear|XGE');
  });

  it('refFeat parses simple name|source', () => {
    const { container } = render(
      <EntryNodeRenderer entry={{ type: 'refFeat', feat: 'Alert|PHB' }} />,
    );
    expect(refAttr(container.innerHTML)).toBe('feat|alert|PHB');
  });
});

describe('options + ingredient', () => {
  it('options renders count label when count is set', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'options', count: 2, entries: ['Choice A', 'Choice B', 'Choice C'] }}
      />,
    );
    expect(container.textContent).toContain('Choose 2');
  });

  it('options without count omits the label', () => {
    const { container } = render(
      <EntryNodeRenderer entry={{ type: 'options', entries: ['Choice'] }} />,
    );
    expect(container.textContent).not.toContain('Choose');
  });

  it('ingredient renders amount + entry text', () => {
    const { container } = render(
      <EntryNodeRenderer entry={{ type: 'ingredient', amount: 2, entry: 'cups of flour' }} />,
    );
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('cups of flour');
  });
});

describe('ability nodes', () => {
  it('abilityDc renders save DC formula with full ability name', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'abilityDc', name: 'Wizard spell', attributes: ['int'] }}
      />,
    );
    expect(container.textContent).toContain('Wizard spell save DC');
    expect(container.textContent).toContain('Intelligence modifier');
  });

  it('abilityAttackMod handles two attributes with "or"', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'abilityAttackMod', name: 'Spell', attributes: ['int', 'cha'] }}
      />,
    );
    expect(container.textContent).toContain('Intelligence or Charisma');
  });
});

describe('misc nodes (hr / dice / bonus / link)', () => {
  it('hr renders <hr>', () => {
    const { container } = render(<EntryNodeRenderer entry={{ type: 'hr' }} />);
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('bonus renders signed value', () => {
    const { container } = render(<EntryNodeRenderer entry={{ type: 'bonus', value: 3 }} />);
    expect(container.textContent).toBe('+3');
  });

  it('bonus handles negatives', () => {
    const { container } = render(<EntryNodeRenderer entry={{ type: 'bonus', value: -1 }} />);
    expect(container.textContent).toBe('-1');
  });

  it('bonusSpeed appends ft.', () => {
    const { container } = render(<EntryNodeRenderer entry={{ type: 'bonusSpeed', value: 10 }} />);
    expect(container.textContent).toBe('+10 ft.');
  });

  it('dice formats toRoll array', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'dice', toRoll: [{ number: 1, faces: 20 }] }}
      />,
    );
    expect(container.textContent).toBe('1d20');
  });

  it('link (node) renders external <a target=_blank>', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'link', text: 'click', href: { type: 'external', url: 'https://x.com' } }}
      />,
    );
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://x.com');
    expect(a?.getAttribute('target')).toBe('_blank');
  });
});

describe('variant nodes', () => {
  it('variant renders heading + entries inside a bordered box', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'variant', name: 'Optional Rule', entries: ['Body.'] }}
      />,
    );
    expect(container.querySelector('h4')?.textContent).toBe('Optional Rule');
    expect(container.querySelector('p')?.textContent).toBe('Body.');
  });

  it('variantSub uses h5 not h4', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'variantSub', name: 'Sub-Variant', entries: ['Body.'] }}
      />,
    );
    expect(container.querySelector('h5')?.textContent).toBe('Sub-Variant');
    expect(container.querySelector('h4')).toBeNull();
  });
});

describe('spellcasting node', () => {
  it('renders headers + at-will + daily + leveled spells', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'spellcasting',
          name: 'Innate Spellcasting',
          headerEntries: ['Casts the following spells:'],
          will: ['Detect Magic', 'Mage Hand'],
          daily: { '3': ['Fireball', 'Counterspell'] },
        }}
      />,
    );
    expect(container.querySelector('h4')?.textContent).toBe('Innate Spellcasting');
    expect(container.textContent).toContain('At will');
    expect(container.textContent).toContain('Detect Magic');
    expect(container.textContent).toContain('3/day');
    expect(container.textContent).toContain('Fireball');
  });
});
