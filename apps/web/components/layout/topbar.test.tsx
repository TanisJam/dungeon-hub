/**
 * Tests for TopBar — backHref prop and AppShell forwarding.
 *
 * T1: backHref present + canBeDM=true → arrow-left Link at /personajes; RoleSwitcher PRESENT.
 *     (SDD ficha-dm-affordances inverts old T1 — overrides design README §State management)
 * T2: backHref absent + canBeDM=true → RoleSwitcher present; no back link.
 * T3: backHref present + right prop → both back arrow (left) and right content render.
 * T4: AppShell with backHref + canBeDM=true → TopBar renders back link AND RoleSwitcher.
 *     (SDD ficha-dm-affordances inverts old T4)
 * T5: AppShell without backHref → TopBar renders RoleSwitcher (no back link).
 * T6: backHref present + canBeDM=false → RoleSwitcher NOT rendered.
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
  it('T1: backHref + canBeDM=true → arrow-left link renders AND RoleSwitcher is visible', () => {
    render(<TopBar title="Ficha" backHref="/personajes" canBeDM={true} />);
    const backLink = screen.getByLabelText('Volver');
    expect(backLink.getAttribute('href')).toBe('/personajes');
    // SDD ficha-dm-affordances: RoleSwitcher must appear in sub-screens when canBeDM=true
    expect(screen.getByTestId('role-switcher')).toBeTruthy();
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

  it('T6: backHref present + canBeDM=false → RoleSwitcher NOT rendered', () => {
    render(<TopBar title="Ficha" backHref="/personajes" canBeDM={false} />);
    expect(screen.getByLabelText('Volver')).toBeTruthy();
    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });
});

describe('AppShell with backHref', () => {
  it('T4: AppShell backHref + canBeDM=true → back link AND RoleSwitcher both render', () => {
    render(<AppShell title="Ficha" backHref="/personajes" canBeDM={true}><div>content</div></AppShell>);
    const backLink = screen.getByLabelText('Volver');
    expect(backLink.getAttribute('href')).toBe('/personajes');
    // SDD ficha-dm-affordances: RoleSwitcher must appear even with backHref when canBeDM=true
    expect(screen.getByTestId('role-switcher')).toBeTruthy();
  });

  it('T5: AppShell without backHref → no back link (RoleSwitcher rendered)', () => {
    render(<AppShell title="Inicio" canBeDM={true}><div>content</div></AppShell>);
    expect(screen.queryByLabelText('Volver')).toBeNull();
    expect(screen.getByTestId('role-switcher')).toBeTruthy();
  });
});
