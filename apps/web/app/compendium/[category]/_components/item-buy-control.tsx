'use client';

// ItemBuyControl — Comprar → confirm (Confirmar/Cancelar) → buyShopItem Server Action.
// market-shop-buy-ui slice 3c. Rendered by ItemHeader only when shopContext is present
// (see ../_config/registry.ts and detail-sheet.tsx — the shopContext threading seam).
// REQ CONFIRM-01, BUY-CALL-01, INSUFFICIENT-01, REFRESH-01, NOCHAR-01.
// REQ-PRICE-AUTH-01: no client-supplied price — buyShopItem never sends one; the API
// resolves cost server-side from the DB.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BuyItemRef } from '@/app/mercado/actions';
import type { ShopContext } from '@/app/compendium/_components/types';
import { costLabel } from './item-header';

// buyShopItem is imported dynamically inside handleConfirm (not statically at module
// scope): the action module pulls in lib/supabase/server → lib/env, which throws
// eagerly at import time when NEXT_PUBLIC_SUPABASE_URL is unset (e.g. under Vitest
// without env stubbing). A static top-level import would break every test that
// renders ItemHeader/ItemRowView without mocking Supabase (headers.test.tsx,
// compendium-list.test.tsx). Deferring the import until the user actually confirms
// a purchase keeps those unrelated tests green.

interface ItemBuyControlProps {
  item: BuyItemRef;
  costCp?: number | null;
  shopContext: ShopContext;
}

export function ItemBuyControl({ item, costCp, shopContext }: ItemBuyControlProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // NOCHAR-01: no active character resolved — no buy affordance is offered at all.
  if (shopContext.characterId === null) {
    return (
      <div className="mt-3 text-sm text-ink-soft">
        Seleccioná un personaje para comprar.
      </div>
    );
  }

  const characterId = shopContext.characterId;

  function handleConfirm() {
    startTransition(async () => {
      setError(null);
      const { buyShopItem } = await import('@/app/mercado/actions');
      const result = await buyShopItem(characterId, item, undefined);
      setConfirming(false);
      if (!result.ok) {
        const insufficientFunds = result.issues.some((issue) => issue.code === 'INSUFFICIENT_FUNDS');
        setError(
          insufficientFunds
            ? 'Fondos insuficientes para comprar este ítem.'
            : 'No se pudo completar la compra.',
        );
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {costCp != null && (
          <span className="text-sm text-ink-soft">Precio: {costLabel(costCp)}</span>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="min-h-[44px] flex-1 rounded-md bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="min-h-[44px] flex-1 rounded-md border border-line px-4 text-sm font-medium text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-[44px] w-full rounded-md bg-ink px-4 text-sm font-medium text-paper"
      >
        Comprar
      </button>
      {error && (
        <div className="mt-2 text-sm text-red-500" aria-live="polite">
          {error}
        </div>
      )}
    </div>
  );
}
