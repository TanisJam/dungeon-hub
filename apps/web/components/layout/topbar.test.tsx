
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

describe('TopBar — semantic heading', () => {
  it('T7: title renders as <h1> — semantic page heading (a11y lock Bug 4)', () => {
    render(<TopBar title="Mundo de Prueba" />);
    // World name (and every page title) must be an <h1> so AT users can jump to the page heading.
    const heading = screen.getByRole('heading', { level: 1, name: 'Mundo de Prueba' });
    expect(heading).toBeTruthy();
    expect(heading.tagName).toBe('H1');
  });
});

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

describe('TopBar — subtitle truncate (REQ-UXP1-TOPBAR-01)', () => {
  it('T11: subtitle span has truncate class', () => {
    render(<TopBar title="Mundo" subtitle="TU GREMIO — DM" />);
    const subtitle = screen.getByText('TU GREMIO — DM');
    expect(subtitle.className).toContain('truncate');
  });

  it('T12: regression — title h1 still has truncate class', () => {
    render(<TopBar title="Mundo" subtitle="TU GREMIO — DM" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Mundo' });
    expect(heading.className).toContain('truncate');
  });
});

describe('TopBar — world switcher slot (REQ-WIS-03)', () => {
  it('T8: worldSwitcher prop present → renders switcher node in left slot (no CrowMark)', () => {
    render(
      <TopBar
        title="Inicio"
        worldSwitcher={<div data-testid="world-switcher-widget">WorldSwitcher</div>}
      />,
    );
    expect(screen.getByTestId('world-switcher-widget')).toBeTruthy();
    // CrowMark must NOT appear when worldSwitcher is provided
    expect(screen.queryByTestId('crow-mark')).toBeNull();
  });

  it('T9: worldSwitcher absent + no backHref → CrowMark renders (graceful fallback, REQ-WIS-03)', () => {
    render(<TopBar title="Inicio" />);
    expect(screen.getByTestId('crow-mark')).toBeTruthy();
    expect(screen.queryByTestId('world-switcher-widget')).toBeNull();
  });

  it('T10: backHref takes precedence over worldSwitcher → back arrow renders, no switcher', () => {
    render(
      <TopBar
        title="Ficha"
        backHref="/personajes"
        worldSwitcher={<div data-testid="world-switcher-widget">WorldSwitcher</div>}
      />,
    );
    expect(screen.getByLabelText('Volver')).toBeTruthy();
    expect(screen.queryByTestId('world-switcher-widget')).toBeNull();
    expect(screen.queryByTestId('crow-mark')).toBeNull();
  });
});
