
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock RoleSwitcher — depends on localStorage/window events; not the focus here.
vi.mock('@/components/layout/role-switcher', () => ({
  RoleSwitcher: () => <div data-testid="role-switcher">RoleSwitcher</div>,
}));

// Mock CrowMark
vi.mock('@/components/ui/crow-mark', () => ({
  CrowMark: () => <div data-testid="crow-mark">CrowMark</div>,
}));

// Mock AccountMenu — it depends on SignOutButton (useRouter + supabase client),
// neither of which is the focus of these AppShell/callerRole tests.
vi.mock('@/components/layout/account-menu', () => ({
  AccountMenu: () => <div data-testid="account-menu">AccountMenu</div>,
}));

// Mock next/navigation — TabBar uses usePathname.
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => ({ get: () => null }),
  useSelectedLayoutSegment: () => null,
}));

import { AppShell } from './app-shell';

describe('AppShell callerRole → RoleSwitcher gating (ADR-A5)', () => {
  // WT-DPPM-A-03: callerRole='player' → toggle must NOT appear (REQ-DPPM-A-RS-01)
  it('WT-DPPM-A-03: callerRole=player → RoleSwitcher NOT rendered', () => {
    render(
      <AppShell title="Campaña" callerRole="player">
        <div>content</div>
      </AppShell>,
    );
    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });

  // WT-DPPM-A-04: callerRole absent/undefined → canBeDM defaults false (REQ-DPPM-A-RS-02)
  // ADR-C2 (Slice C): canBeDMProp default is now FALSE. Passing callerRole=null or omitting
  // both callerRole and canBeDM results in no pill (safe default-deny).
  it('WT-DPPM-A-04: callerRole=null → RoleSwitcher NOT rendered', () => {
    render(
      <AppShell title="Campaña" callerRole={null}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });

  // WT-DPPM-A-05: callerRole='gm' → toggle IS rendered (regression guard, REQ-DPPM-A-RS-04)
  it('WT-DPPM-A-05: callerRole=gm → RoleSwitcher IS rendered', () => {
    render(
      <AppShell title="Campaña" callerRole="gm">
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('role-switcher')).toBeTruthy();
  });

  // SC-RS-01 (CRITICAL): The ADR-5 derivation in AppShell correctly gates on callerRole !== 'gm'.
  it('SC-RS-01: callerRole=player on campaign detail page suppresses pill', () => {
    render(
      <AppShell title="Lost Mines" subtitle="CAMPAÑA" backHref="/campanas" callerRole="player">
        <div>sessions list</div>
      </AppShell>,
    );
    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });

  // SC-RS-02 (CRITICAL): callerRole=null (active world unavailable) → safe default, no pill.
  it('SC-RS-02: callerRole=null (no active world) suppresses pill', () => {
    render(
      <AppShell title="Constructor" subtitle="NUEVO PERSONAJE" callerRole={null}>
        <div>form</div>
      </AppShell>,
    );
    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });

  // SC-RS-03 (regression): callerRole=gm → DM toggle works.
  it('SC-RS-03: callerRole=gm shows pill for GM', () => {
    render(
      <AppShell title="Constructor" subtitle="NUEVO PERSONAJE" callerRole="gm">
        <div>form</div>
      </AppShell>,
    );
    expect(screen.getByTestId('role-switcher')).toBeTruthy();
  });

  // WT-DPPMC-C2 (Slice C — ADR-C2 lock): <AppShell> with NO callerRole and NO canBeDM
  // must NOT render RoleSwitcher. This test locks the default-deny flip (REQ-DPPMC-SHELL-02).
  it('WT-DPPMC-C2: no callerRole, no canBeDM → RoleSwitcher NOT rendered (default-deny)', () => {
    render(
      <AppShell title="Página sin mundo">
        <div>content</div>
      </AppShell>,
    );
    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });
});
