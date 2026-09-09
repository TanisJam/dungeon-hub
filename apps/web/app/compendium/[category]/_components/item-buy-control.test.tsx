// market-shop-buy-ui slice 3c — ItemBuyControl (Comprar → confirm → buyShopItem) +
// ItemHeader wiring (renders ItemBuyControl only when shopContext is present).
// REQ BUY-CTA-01, CONFIRM-01, BUY-CALL-01, INSUFFICIENT-01, REFRESH-01, NOCHAR-01,
// BROWSE-UNCHANGED-01 (header portion).
// afterEach(cleanup) is global (apps/web/vitest.setup.ts) — do NOT re-add.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/app/mercado/actions', () => ({
  buyShopItem: vi.fn(),
}));

import { buyShopItem } from '@/app/mercado/actions';
import { ItemBuyControl } from './item-buy-control';
import { ItemHeader } from './item-header';

const LONGSWORD_FIXTURE = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M',
  weight: '3',
  costCp: 1500,
  reprintedAs: null,
  data: { rarity: 'none', property: ['V'], entries: [] },
};

describe('ItemHeader — shop wiring (market-shop-buy-ui 3c)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BUY-CTA-01: shows "Comprar" when shopContext is present', () => {
    render(<ItemHeader data={LONGSWORD_FIXTURE} shopContext={{ characterId: 'c1' }} />);
    expect(screen.getByText('Comprar')).toBeTruthy();
  });

  it('BROWSE-UNCHANGED-01: no "Comprar" when shopContext is absent', () => {
    render(<ItemHeader data={LONGSWORD_FIXTURE} />);
    expect(screen.queryByText('Comprar')).toBeNull();
  });
});

describe('ItemBuyControl (market-shop-buy-ui 3c)', () => {
  const ITEM = { slug: 'longsword', source: 'PHB' };

  beforeEach(() => vi.clearAllMocks());

  it('BUY-CTA-01: renders "Comprar" with a valid characterId', () => {
    render(<ItemBuyControl item={ITEM} costCp={1500} shopContext={{ characterId: 'c1' }} />);
    expect(screen.getByText('Comprar')).toBeTruthy();
  });

  it('CONFIRM-01: tapping Comprar shows Confirmar/Cancelar and does not call buyShopItem yet', () => {
    render(<ItemBuyControl item={ITEM} costCp={1500} shopContext={{ characterId: 'c1' }} />);
    fireEvent.click(screen.getByText('Comprar'));
    expect(screen.getByText('Confirmar')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
    expect(buyShopItem).not.toHaveBeenCalled();
  });

  it('CONFIRM-01: tapping Cancelar closes the confirm step without calling buyShopItem', () => {
    render(<ItemBuyControl item={ITEM} costCp={1500} shopContext={{ characterId: 'c1' }} />);
    fireEvent.click(screen.getByText('Comprar'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Confirmar')).toBeNull();
    expect(buyShopItem).not.toHaveBeenCalled();
  });

  it('BUY-CALL-01: tapping Confirmar calls buyShopItem(characterId, item, undefined)', async () => {
    vi.mocked(buyShopItem).mockResolvedValue({
      ok: true,
      character: {},
      currency: {},
      addedInstanceId: 'inst-1',
      warnings: [],
    });
    render(<ItemBuyControl item={ITEM} costCp={1500} shopContext={{ characterId: 'c1' }} />);
    fireEvent.click(screen.getByText('Comprar'));
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => {
      expect(buyShopItem).toHaveBeenCalledWith('c1', ITEM, undefined);
    });
  });

  it('INSUFFICIENT-01: on INSUFFICIENT_FUNDS issue, shows a message, dismisses confirm, does not crash', async () => {
    vi.mocked(buyShopItem).mockResolvedValue({
      ok: false,
      issues: [{ code: 'INSUFFICIENT_FUNDS', requestedCp: 1500, availableCp: 100, shortfallCp: 1400 }],
    });
    render(<ItemBuyControl item={ITEM} costCp={1500} shopContext={{ characterId: 'c1' }} />);
    fireEvent.click(screen.getByText('Comprar'));
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => {
      expect(screen.getByText(/fondos insuficientes/i)).toBeTruthy();
    });
    expect(screen.queryByText('Confirmar')).toBeNull();
  });

  it('REFRESH-01: on success, router.refresh() is called once', async () => {
    vi.mocked(buyShopItem).mockResolvedValue({
      ok: true,
      character: {},
      currency: {},
      addedInstanceId: 'inst-1',
      warnings: [],
    });
    render(<ItemBuyControl item={ITEM} costCp={1500} shopContext={{ characterId: 'c1' }} />);
    fireEvent.click(screen.getByText('Comprar'));
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('NOCHAR-01: characterId null → prompts to select a character, no buy action callable', () => {
    render(<ItemBuyControl item={ITEM} costCp={1500} shopContext={{ characterId: null }} />);
    expect(screen.queryByText('Comprar')).toBeNull();
    expect(screen.getByText(/seleccioná un personaje/i)).toBeTruthy();
    expect(buyShopItem).not.toHaveBeenCalled();
  });
});
