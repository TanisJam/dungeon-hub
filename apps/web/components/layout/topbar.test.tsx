/**
 * Tests for TopBar — backHref prop and AppShell forwarding.
 *
 * T1: backHref present → arrow-left Link at /personajes; no RoleSwitcher.
 * T2: backHref absent + canBeDM=true → RoleSwitcher present; no back link.
 * T3: backHref present + right prop → both back arrow (left) and right content render.
 * T4: AppShell with backHref → TopBar renders back link.
 * T5: AppShell without backHref → TopBar renders RoleSwitcher (no back link).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock RoleSwitcher — it depends on localStorage/window events; not the focus here.
vi.mock('@/components/layout/role-switcher', () => ({
  RoleSwitcher: () => <div data-testid="role-switcher">RoleSwitcher</div>,
}));

// Mock CrowMark
vi.mock('@/components/ui/crow-mark', () => ({
  CrowMark: () => <div data-testid="crow-mark">CrowMark</div>,
}));

// Mock next/navigation — TabBar uses usePathname.
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => ({ get: () => null }),
  useSelectedLayoutSegment: () => null,
}));

import { TopBar } from './topbar';
import { AppShell } from './app-shell';

describe('TopBar', () => {
  it('T1: backHref renders arrow-left link with correct href; RoleSwitcher absent', () => {
    render(<TopBar title="Ficha" backHref="/personajes" />);
    const backLink = screen.getByLabelText('Volver');
    expect(backLink.getAttribute('href')).toBe('/personajes');
    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });

  it('T2: without backHref and canBeDM=true → RoleSwitcher rendered; no back link', () => {
    render(<TopBar title="Inicio" canBeDM={true} />);
    expect(screen.getByTestId('role-switcher')).toBeTruthy();
    expect(screen.queryByLabelText('Volver')).toBeNull();
  });

  it('T3: backHref + right prop → both back link and right content render', () => {
    render(
      <TopBar
        title="Ficha"
        backHref="/personajes"
        right={<span data-testid="right-content">Activo</span>}
      />,
    );
    expect(screen.getByLabelText('Volver')).toBeTruthy();
    expect(screen.getByTestId('right-content')).toBeTruthy();
  });
});

describe('AppShell with backHref', () => {
  it('T4: AppShell backHref → TopBar renders back link to /personajes', () => {
    render(<AppShell title="Ficha" backHref="/personajes"><div>content</div></AppShell>);
    const backLink = screen.getByLabelText('Volver');
    expect(backLink.getAttribute('href')).toBe('/personajes');
  });

  it('T5: AppShell without backHref → no back link (RoleSwitcher rendered)', () => {
    render(<AppShell title="Inicio" canBeDM={true}><div>content</div></AppShell>);
    expect(screen.queryByLabelText('Volver')).toBeNull();
    expect(screen.getByTestId('role-switcher')).toBeTruthy();
  });
});
