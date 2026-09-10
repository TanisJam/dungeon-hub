
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SheetTabs } from './sheet-tabs';

describe('SheetTabs', () => {
  it('T1: active tab (resumen) has class ficha-tab-active', () => {
    // The visual class lives on the inner <span> (the pill); the <a> is the
    // 44px transparent tap target introduced for the touch-target fix.
    render(<SheetTabs activeTab="resumen" characterId="char-1" />);
    const resumenLink = screen.getByRole('link', { name: 'Resumen' });
    expect(resumenLink.querySelector('span')?.className).toContain('ficha-tab-active');
  });

  it('T2: inactive tabs do NOT have class ficha-tab-active', () => {
    render(<SheetTabs activeTab="resumen" characterId="char-1" />);
    const habilidadesLink = screen.getByRole('link', { name: 'Habilidades' });
    expect(habilidadesLink.querySelector('span')?.className).not.toContain('ficha-tab-active');
  });

  it('T3: codex-rehome — "Códex" tab is removed from the sheet (re-homed to main /codex tab)', () => {
    render(<SheetTabs activeTab="resumen" characterId="char-42" />);

    // The Codex was moved to the main menu tab (active-character scoped).
    expect(screen.queryByRole('link', { name: 'Códex' })).toBeNull();
    // The old "Bestiario" label is also gone (predates the re-home).
    expect(screen.queryByRole('link', { name: 'Bestiario' })).toBeNull();
  });
});
