/**
 * Tests for DMQuickActions component
 *
 * REQ-IDM-QUICK-ACTIONS-05: Iniciativa Link to /encuentros, NPC + Loot as stub buttons with aria-disabled
 */
import React from 'react';
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
});
