
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { redirect } from 'next/navigation';
import HerramientasIndexPage from './page';

describe('HerramientasIndexPage', () => {
  it('redirects to /herramientas/facciones', () => {
    HerramientasIndexPage();
    expect(redirect).toHaveBeenCalledWith('/herramientas/facciones');
  });
});
