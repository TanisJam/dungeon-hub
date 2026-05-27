/**
 * Tests for SheetTabs — ficha-tab-active class assertions.
 *
 * T1: active tab link has class ficha-tab-active.
 * T2: inactive tabs do NOT have class ficha-tab-active.
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
});
