// ShopCurationEditor — DM shop curation island (market-shop-dm-stock-web 3d).
// REQ-TIENDA-EDITOR-01: enabled toggle + per-item forSale checkboxes.
// afterEach(cleanup) is global (apps/web/vitest.setup.ts) — do NOT re-add.
//
// Dynamic-import gotcha (see item-buy-control.tsx): the component defers
// `import('@/app/herramientas/tienda/actions')` until the user actually
// toggles something, so mocking the module here is enough — no need to
// mock '@/lib/supabase/server' separately.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/app/herramientas/tienda/actions', () => ({
  setShopListings: vi.fn(),
}));

import { setShopListings } from '@/app/herramientas/tienda/actions';
import { ShopCurationEditor } from './shop-curation-editor';

const ITEMS = [
  { slug: 'longsword', source: 'PHB', name: 'Longsword' },
  { slug: 'dagger', source: 'PHB', name: 'Dagger' },
];

describe('ShopCurationEditor (market-shop-dm-stock-web 3d)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the enabled toggle + a checkbox per item reflecting initial forSale membership', () => {
    render(
      <ShopCurationEditor
        worldId="w1"
        items={ITEMS}
        initialEnabled={true}
        initialForSale={['longsword|PHB']}
      />,
    );

    const enabledToggle = screen.getByLabelText(/curaduría de tienda activa/i) as HTMLInputElement;
    expect(enabledToggle.checked).toBe(true);

    const longswordCheckbox = screen.getByLabelText('Longsword') as HTMLInputElement;
    const daggerCheckbox = screen.getByLabelText('Dagger') as HTMLInputElement;
    expect(longswordCheckbox.checked).toBe(true);
    expect(daggerCheckbox.checked).toBe(false);
  });

  it('toggling an item checkbox calls setShopListings with the updated forSale set', async () => {
    vi.mocked(setShopListings).mockResolvedValue({
      ok: true,
      data: { enabled: true, forSale: ['longsword|PHB', 'dagger|PHB'] },
    });

    render(
      <ShopCurationEditor
        worldId="w1"
        items={ITEMS}
        initialEnabled={true}
        initialForSale={['longsword|PHB']}
      />,
    );

    fireEvent.click(screen.getByLabelText('Dagger'));

    await waitFor(() => {
      expect(setShopListings).toHaveBeenCalledWith('w1', {
        forSale: ['longsword|PHB', 'dagger|PHB'],
      });
    });
  });

  it('unchecking an item removes it from the forSale set sent to setShopListings', async () => {
    vi.mocked(setShopListings).mockResolvedValue({
      ok: true,
      data: { enabled: true, forSale: [] },
    });

    render(
      <ShopCurationEditor
        worldId="w1"
        items={ITEMS}
        initialEnabled={true}
        initialForSale={['longsword|PHB']}
      />,
    );

    fireEvent.click(screen.getByLabelText('Longsword'));

    await waitFor(() => {
      expect(setShopListings).toHaveBeenCalledWith('w1', { forSale: [] });
    });
  });

  it('toggling enabled calls setShopListings with the new enabled value', async () => {
    vi.mocked(setShopListings).mockResolvedValue({
      ok: true,
      data: { enabled: false, forSale: ['longsword|PHB'] },
    });

    render(
      <ShopCurationEditor
        worldId="w1"
        items={ITEMS}
        initialEnabled={true}
        initialForSale={['longsword|PHB']}
      />,
    );

    fireEvent.click(screen.getByLabelText(/curaduría de tienda activa/i));

    await waitFor(() => {
      expect(setShopListings).toHaveBeenCalledWith('w1', { enabled: false });
    });
  });
});
