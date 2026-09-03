/**
 * Test for /herramientas index redirect.
 * Redirects to the first HERRAMIENTAS_SUBNAV_ITEMS entry (/herramientas/facciones).
 */
import React from 'react';
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
