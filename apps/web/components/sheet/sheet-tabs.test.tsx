/**
 * Tests for SheetTabs — ficha-tab-active class assertions + codex retarget.
 *
 * T1: active tab link has class ficha-tab-active.
 * T2: inactive tabs do NOT have class ficha-tab-active.
 * T3: REQ-CCB-WEB-05 — "Códex" tab label + /codex href (replaces old "Bestiario" /codex/bestiario).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SheetTabs } from './sheet-tabs';

describe('SheetTabs', () => {
  it('T1: active tab (resumen) has class ficha-tab-active', () => {
    render(<SheetTabs activeTab="resumen" characterId="char-1" />);
    const resumenLink = screen.getByRole('link', { name: 'Resumen' });
    expect(resumenLink.className).toContain('ficha-tab-active');
  });

  it('T2: inactive tabs do NOT have class ficha-tab-active', () => {
    render(<SheetTabs activeTab="resumen" characterId="char-1" />);
    const habilidadesLink = screen.getByRole('link', { name: 'Habilidades' });
    expect(habilidadesLink.className).not.toContain('ficha-tab-active');
  });

  it('T3: REQ-CCB-WEB-05 — "Códex" tab navigates to /characters/:id/codex (not /codex/bestiario)', () => {
    render(<SheetTabs activeTab="resumen" characterId="char-42" />);

    // "Códex" label must be present (replaces "Bestiario")
    const codexLink = screen.getByRole('link', { name: 'Códex' });
    expect(codexLink).toBeTruthy();
    expect(codexLink.getAttribute('href')).toBe('/characters/char-42/codex');

    // "Bestiario" must be gone
    expect(screen.queryByRole('link', { name: 'Bestiario' })).toBeNull();
  });
});
