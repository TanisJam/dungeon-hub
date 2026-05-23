import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { InlineRenderer } from '../inline';

describe('mechanic tag handlers (Phase B)', () => {
  it('{@dc 15} renders "DC 15" badge without data-compendium-ref', () => {
    const { container } = render(<InlineRenderer text="{@dc 15}" />);
    expect(container.textContent).toBe('DC 15');
    expect(container.innerHTML).not.toContain('data-compendium-ref');
  });

  it('{@dice 2d6} renders the dice expression', () => {
    const { container } = render(<InlineRenderer text="{@dice 2d6}" />);
    expect(container.textContent).toBe('2d6');
  });

  it('{@damage 8d6} renders the damage value', () => {
    const { container } = render(<InlineRenderer text="{@damage 8d6}" />);
    expect(container.textContent).toBe('8d6');
  });

  it('{@hit 5} renders with a + prefix', () => {
    const { container } = render(<InlineRenderer text="{@hit 5}" />);
    expect(container.textContent).toBe('+5');
  });

  it('{@chance 33} renders with % suffix', () => {
    const { container } = render(<InlineRenderer text="{@chance 33}" />);
    expect(container.textContent).toBe('33%');
  });

  it('{@recharge 5} renders "(Recharge 5)"', () => {
    const { container } = render(<InlineRenderer text="{@recharge 5}" />);
    expect(container.textContent).toContain('Recharge 5');
  });

  it('{@atk mw} expands to the attack-type label', () => {
    const { container } = render(<InlineRenderer text="{@atk mw}" />);
    expect(container.textContent).toBe('Melee Weapon Attack:');
  });

  it('{@actSave Dexterity} renders save label', () => {
    const { container } = render(<InlineRenderer text="{@actSave Dexterity}" />);
    expect(container.textContent).toBe('Dexterity Save:');
  });
});

describe('formatting tag handlers (Phase B)', () => {
  it('{@b Bold} renders <strong>', () => {
    const { container } = render(<InlineRenderer text="{@b Bold text}" />);
    expect(container.querySelector('strong')?.textContent).toBe('Bold text');
  });

  it('{@i italic} renders <em>', () => {
    const { container } = render(<InlineRenderer text="{@i italic phrase}" />);
    expect(container.querySelector('em')?.textContent).toBe('italic phrase');
  });

  it('{@h} renders the "Hit:" label', () => {
    const { container } = render(<InlineRenderer text="{@h}" />);
    expect(container.textContent).toBe('Hit:');
  });

  it('{@note sidenote} renders muted italic span', () => {
    const { container } = render(<InlineRenderer text="{@note sidenote}" />);
    expect(container.textContent).toBe('sidenote');
  });

  it('{@link display|https://example.com} renders external <a>', () => {
    const { container } = render(<InlineRenderer text="{@link click here|https://example.com}" />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toBe('click here');
  });
});

describe('Phase B regression — unknown tag still falls back', () => {
  it('{@futureTagXyz hello} renders display text', () => {
    const { container } = render(<InlineRenderer text="{@futureTagXyz hello|extra}" />);
    expect(container.textContent).toBe('hello');
  });
});
