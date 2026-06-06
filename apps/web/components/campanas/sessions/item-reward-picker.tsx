'use client';

/**
 * ItemRewardPicker — compendium item typeahead for CompleteForm reward rows.
 *
 * Bug fix (#1953): the item reward rows used plain text inputs for slug + source,
 * so a DM typing an item NAME (not the exact lowercase-kebab slug) always got
 * "item not found" on submit. This picker searches the campaign's compendium items
 * and emits the exact { slug, source, name } — the DM never types a slug.
 *
 * Mobile-first: full-width search + tappable result rows (min-h-[44px]).
 * Renders inline inside the CompleteForm V3Sheet (no nested modal).
 */

import { useEffect, useRef, useState } from 'react';
import { searchSessionItems, type ItemHit } from '@/app/campanas/[id]/sessions/actions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PickedItem {
  slug: string;
  source: string;
  name: string;
}

export interface ItemRewardPickerProps {
  /** Campaign scope — required by GET /compendium/items (XOR campaign/world). */
  campaignId: string;
  /** Called when the DM picks an item. */
  onPick: (item: PickedItem) => void;
  /** Optional id suffix so multiple rows get unique input ids/labels. */
  idSuffix?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItemRewardPicker({ campaignId, onPick, idSuffix = '' }: ItemRewardPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemHit[]>([]);
  const [searching, setSearching] = useState(false);
  const reqIdRef = useRef(0);

  // Debounced search — 200ms after the last keystroke; drop stale responses.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const hits = await searchSessionItems(campaignId, trimmed);
      if (reqIdRef.current === myReqId) {
        setResults(hits);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, campaignId]);

  function handlePick(item: ItemHit) {
    onPick({ slug: item.slug, source: item.source, name: item.name });
    setQuery('');
    setResults([]);
  }

  const trimmed = query.trim();
  const inputId = `item-search${idSuffix}`;

  return (
    <div>
      <label htmlFor={inputId} className="block font-sans text-xs text-ink-mute">
        Buscar ítem
      </label>
      <input
        id={inputId}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ej. poción de curación"
        className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
      />

      {trimmed.length > 0 && searching && (
        <p className="mt-2 font-sans text-xs text-ink-mute">Buscando…</p>
      )}
      {trimmed.length > 0 && !searching && results.length === 0 && (
        <p className="mt-2 font-sans text-xs text-ink-mute">Sin resultados.</p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-md border border-line">
          {results.map((item) => (
            <li key={`${item.slug}|${item.source}`}>
              <button
                type="button"
                onClick={() => handlePick(item)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left font-sans text-sm text-ink transition-colors hover:bg-paper active:bg-surface-raised"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-ink-mute">
                  {item.source}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
