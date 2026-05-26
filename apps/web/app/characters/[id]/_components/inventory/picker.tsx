'use client';

/**
 * Inventory item picker — full-screen modal at 375px.
 *
 * REQ-INV-ADD-ITEM (spec #843 — inventory-foundation): user opens the picker,
 * searches compendium items scoped to the character's world, and taps a row
 * to add it to inventory.
 *
 * REQ-INV-MOBILE-LAYOUT: full-screen modal (no desktop sidebar), tap targets
 * ≥44×44px, no horizontal scroll at 375px (iPhone SE).
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  addInventoryItem,
  searchCompendiumItems,
  type CompendiumItemHit,
} from '../../actions';

interface PickerProps {
  characterId: string;
  worldId: string;
}

export function Picker({ characterId, worldId }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompendiumItemHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reqIdRef = useRef(0);

  // Focus the search input when the modal opens — mobile UX expects the
  // keyboard up immediately when the bottom-sheet appears.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced search — re-issue on query change after 200ms idle.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const hits = await searchCompendiumItems(worldId, trimmed);
      // Drop stale responses.
      if (reqIdRef.current === myReqId) {
        setResults(hits);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, worldId]);

  function handleClose() {
    setOpen(false);
    setQuery('');
    setResults([]);
    setError(null);
  }

  function handlePick(item: CompendiumItemHit) {
    if (isPending) return;
    startTransition(async () => {
      const result = await addInventoryItem(
        characterId,
        { slug: item.slug, source: item.source },
        1,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      handleClose();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-4 py-3 text-sm font-semibold text-ink hover:bg-paper-muted transition-colors"
      >
        + Agregar ítem
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inventory-picker-title"
          className="fixed inset-0 z-50 flex flex-col bg-paper"
        >
          {/* Header — sticky */}
          <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
            <h2
              id="inventory-picker-title"
              className="flex-1 text-sm font-bold text-ink"
            >
              Agregar ítem
            </h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar"
              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-mute hover:bg-paper-muted hover:text-ink transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Search input — sticky */}
          <div className="border-b border-line bg-paper px-4 py-3">
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ítem…"
              className="min-h-[44px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2">
              <p role="alert" className="text-xs font-medium text-red-700">
                {error}
              </p>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {query.trim().length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-ink-mute">
                Empezá a escribir para buscar.
              </p>
            )}
            {query.trim().length > 0 && searching && (
              <p className="px-4 py-10 text-center text-sm text-ink-mute">
                Buscando…
              </p>
            )}
            {query.trim().length > 0 && !searching && results.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-ink-mute">
                Sin resultados.
              </p>
            )}
            {results.length > 0 && (
              <ul className="divide-y divide-line">
                {results.map((item) => (
                  <li key={`${item.slug}|${item.source}`}>
                    <button
                      type="button"
                      onClick={() => handlePick(item)}
                      disabled={isPending}
                      className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-paper-soft active:bg-paper-muted transition-colors disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {item.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-ink-mute">
                          {item.source}
                          {item.weight != null && (
                            <span className="ml-2 normal-case">
                              {item.weight} lb
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-bold text-ink-soft">
                        +
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
