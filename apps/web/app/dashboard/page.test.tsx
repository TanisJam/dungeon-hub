import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { redirect } from 'next/navigation';
import DashboardPage from './page';

describe('DashboardPage — dissolved (navigability-audit fix)', () => {
  it('redirects to /inicio (route kept alive for saved links/history)', () => {
    DashboardPage();
    expect(redirect).toHaveBeenCalledWith('/inicio');
  });
});
