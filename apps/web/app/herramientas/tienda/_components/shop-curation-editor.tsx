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
  const [query, setQuery] = useState('');

  // The mundane catalog runs to hundreds of items; rendering them all made this
  // an ~18k-px scroll on mobile. Filter client-side and cap what we paint so the
  // DM searches instead of scrolling.
  const CAP = 60;
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
  const visible = filtered.slice(0, CAP);
  const hiddenCount = filtered.length - visible.length;

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
      <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isPending}
          onChange={(e) => handleEnabledToggle(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent)]"
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
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <input
              type="search"
              inputMode="search"
              placeholder="Buscar ítems…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar ítems"
              className="min-h-[44px] flex-1 rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
            />
            <span className="shrink-0 text-xs text-ink-mute">
              {forSale.size} a la venta
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-ink-soft">
              Sin resultados para «{query.trim()}»
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
              {visible.map((item) => {
                const key = itemKey(item);
                return (
                  <li key={key} className="px-3">
                    {/*
                      The input covers the row rather than sitting in it: a 16px
                      box is a 16px target however tappable the label around it
                      is, and this list holds 200 of them. The box below is the
                      drawing; this is the control.

                      24px, not 16: the radius scale starts at 8px, and 8 on a
                      16px box closes into a circle — which reads as a radio,
                      not a checkbox.
                    */}
                    <label className="relative flex min-h-[44px] w-full items-center gap-3 py-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={forSale.has(key)}
                        disabled={isPending}
                        onChange={(e) => handleItemToggle(item, e.target.checked)}
                        aria-label={item.name}
                        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none disabled:cursor-not-allowed"
                      />
                      <span
                        aria-hidden="true"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-line bg-paper-soft text-xs font-bold text-on-accent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:border-accent"
                      >
                        {forSale.has(key) ? '✓' : ''}
                      </span>
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

          {hiddenCount > 0 && (
            <p className="px-1 text-xs text-ink-mute">
              Mostrando {visible.length} de {filtered.length} — afiná la búsqueda para ver el resto.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
