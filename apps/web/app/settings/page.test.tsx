
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { redirect } from 'next/navigation';
import SettingsIndexPage from './page';

describe('SettingsIndexPage', () => {
  it('redirects to /dashboard', () => {
    SettingsIndexPage();
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});
