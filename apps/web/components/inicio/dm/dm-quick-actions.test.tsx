
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DMQuickActions } from './dm-quick-actions';

describe('DMQuickActions', () => {
  it('T1: Iniciativa cell is an anchor with href="/encuentros" and contains text "Iniciativa"', () => {
    const { container } = render(<DMQuickActions />);
    const links = container.querySelectorAll('a');
    const iniciativaLink = Array.from(links).find((a) => a.textContent?.includes('Iniciativa'));
    expect(iniciativaLink).toBeTruthy();
    expect(iniciativaLink!.getAttribute('href')).toBe('/encuentros');
  });

  it('T2: icon-cell element with class inicio-quick-iniciativa-ic is present', () => {
    const { container } = render(<DMQuickActions />);
    expect(container.querySelector('.inicio-quick-iniciativa-ic')).toBeTruthy();
  });

  it('T3: Nuevo NPC is a button with aria-disabled="true" and cursor-not-allowed class', () => {
    const { container } = render(<DMQuickActions />);
    const buttons = container.querySelectorAll('button');
    const npcBtn = Array.from(buttons).find((b) => b.textContent?.includes('Nuevo NPC'));
    expect(npcBtn).toBeTruthy();
    expect(npcBtn!.getAttribute('aria-disabled')).toBe('true');
    expect(npcBtn!.className).toContain('cursor-not-allowed');
  });

  it('T4: Loot is a button with aria-disabled="true" and cursor-not-allowed class', () => {
    const { container } = render(<DMQuickActions />);
    const buttons = container.querySelectorAll('button');
    const lootBtn = Array.from(buttons).find((b) => b.textContent?.includes('Loot'));
    expect(lootBtn).toBeTruthy();
    expect(lootBtn!.getAttribute('aria-disabled')).toBe('true');
    expect(lootBtn!.className).toContain('cursor-not-allowed');
  });

  it('T5: clicking Nuevo NPC and Loot buttons does not throw', () => {
    const { container } = render(<DMQuickActions />);
    const buttons = container.querySelectorAll('button');
    expect(() => {
      buttons.forEach((btn) => fireEvent.click(btn));
    }).not.toThrow();
  });

  it('T6: /campanas link present (Mesa absorption — REQ-NAV-02)', () => {
    const { container } = render(<DMQuickActions />);
    const links = container.querySelectorAll('a');
    const campañasLink = Array.from(links).find((a) => a.getAttribute('href') === '/campanas');
    expect(campañasLink).toBeTruthy();
  });

  it('T7: /herramientas/facciones link present (DM tools entry — REQ-DMTOOLS-01)', () => {
    const { container } = render(<DMQuickActions />);
    const links = container.querySelectorAll('a');
    const herramientasLink = Array.from(links).find((a) => a.getAttribute('href') === '/herramientas/facciones');
    expect(herramientasLink).toBeTruthy();
  });

  it('T8: renders no emoji glyphs — icons are line-icons, not emoji (ux-p2-consistency Fix 1)', () => {
    const { container } = render(<DMQuickActions />);
    // eslint-disable-next-line no-misleading-character-class -- emoji detection regex
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiPattern.test(container.textContent ?? '')).toBe(false);
  });

  it('T9: renders one Icon svg per action cell (5 cells: Iniciativa, Herramientas, Mesa, NPC, Loot)', () => {
    const { container } = render(<DMQuickActions />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(5);
  });
});
