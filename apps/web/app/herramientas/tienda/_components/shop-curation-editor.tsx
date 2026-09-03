'use client';

// ShopCurationEditor — DM shop curation island (market-shop-dm-stock-web 3d).
// Top-level "enabled" toggle for rulesProfile.shopCuration, plus a per-item
// "a la venta" checkbox reflecting forSale membership. Each change calls
// setShopListings(worldId, ...) directly (no separate save step).
// REQ-TIENDA-EDITOR-01.
//
// Dynamic-import gotcha (mirrors item-buy-control.tsx): the actions module
// pulls in lib/supabase/server → lib/env, which throws eagerly at import
// time when NEXT_PUBLIC_* is unset (e.g. under Vitest without env stubbing).
// Deferring the import until the user actually toggles something keeps
// unrelated tests that render this island green.

import { useState, useTransition } from 'react';

export interface ShopItemRef {
  slug: string;
  source: string;
  name: string;
}

interface ShopCurationEditorProps {
  worldId: string;
  items: ShopItemRef[];
  initialEnabled: boolean;
  initialForSale: string[];
}

function itemKey(item: ShopItemRef): string {
  return `${item.slug}|${item.source}`;
}

export function ShopCurationEditor({
  worldId,
  items,
  initialEnabled,
  initialForSale,
}: ShopCurationEditorProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [forSale, setForSale] = useState<Set<string>>(new Set(initialForSale));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEnabledToggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const { setShopListings } = await import('@/app/herramientas/tienda/actions');
      const result = await setShopListings(worldId, { enabled: next });
      if (!result.ok) {
        setEnabled(previous);
        setError(result.error);
      }
    });
  }

  function handleItemToggle(item: ShopItemRef, checked: boolean) {
    const previous = forSale;
    const nextSet = new Set(forSale);
    const key = itemKey(item);
    if (checked) nextSet.add(key);
    else nextSet.delete(key);
    const nextArray = Array.from(nextSet);

    setForSale(nextSet);
    setError(null);
    startTransition(async () => {
      const { setShopListings } = await import('@/app/herramientas/tienda/actions');
      const result = await setShopListings(worldId, { forSale: nextArray });
      if (!result.ok) {
        setForSale(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isPending}
          onChange={(e) => handleEnabledToggle(e.target.checked)}
          className="h-4 w-4"
        />
        Curaduría de tienda activa
      </label>

      <p className="text-xs text-ink-mute">
        Cuando la curaduría está activa, el Mercado solo muestra los ítems marcados
        &quot;a la venta&quot; a continuación. Si está inactiva, el Mercado muestra todos
        los ítems mundanos del mundo.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-ink-mute">No hay ítems mundanos en este mundo.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-white">
          {items.map((item) => {
            const key = itemKey(item);
            return (
              <li key={key} className="flex min-h-[44px] items-center px-3 py-2">
                <label className="flex w-full items-center gap-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={forSale.has(key)}
                    disabled={isPending}
                    onChange={(e) => handleItemToggle(item, e.target.checked)}
                    aria-label={item.name}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-mute">
                    {item.source}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
