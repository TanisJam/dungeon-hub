'use client';

/**
 * DmGrantPanel — DM-only reward entry-point on the character sheet.
 *
 * SDD dm-session-grants (spec #867):
 *   REQ-CDG-DM-PANEL-VISIBILITY: renders nothing unless callerRole === 'gm'
 *   REQ-CDG-DM-PANEL-INTERACTION: full-screen modal at 375px, 3 tabs (XP/Oro/Ítem)
 *   REQ-CDG-XP-FORM: signed integer input → grantXp
 *   REQ-CDG-GOLD-FORM: 5 coin inputs, "Corregir" toggle → grantGold
 *   REQ-CDG-ITEM-FORM: debounced typeahead → grantItem
 *
 * Tabs ABOVE form for thumb reach at 375px.
 * Modal pattern copied from inventory/picker.tsx (full-screen, ESC + backdrop).
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  grantXp,
  grantGold,
  grantItem,
  searchCompendiumItems,
  type CompendiumItemHit,
} from '../actions';

type CallerRole = 'gm' | 'player' | null;
type Tab = 'xp' | 'gold' | 'item';

interface DmGrantPanelProps {
  characterId: string;
  callerRole: CallerRole;
  worldId: string;
}

export function DmGrantPanel({ characterId, callerRole, worldId }: DmGrantPanelProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('xp');

  // Gate: only GMs see this panel
  if (callerRole !== 'gm') return null;

  function handleOpen() {
    setActiveTab('xp');
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Otorgar recompensa de DM"
        className="min-h-[44px] w-full rounded-md border border-primary bg-primary-soft px-4 py-3 text-sm font-semibold text-primary-deep hover:bg-primary-muted transition-colors"
      >
        Otorgar
      </button>

      {open && (
        <DmGrantModal
          characterId={characterId}
          worldId={worldId}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={handleClose}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface DmGrantModalProps {
  characterId: string;
  worldId: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onClose: () => void;
}

function DmGrantModal({
  characterId,
  worldId,
  activeTab,
  onTabChange,
  onClose,
}: DmGrantModalProps) {
  // Close on ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    // Body scroll lock
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dm-grant-panel-title"
      className="fixed inset-0 z-50 flex flex-col bg-paper"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
        <h2
          id="dm-grant-panel-title"
          className="flex-1 text-sm font-bold text-ink"
        >
          Otorgar recompensa
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink-mute hover:bg-paper-muted hover:text-ink transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Tabs ABOVE form — thumb reach at 375px */}
      <div className="flex border-b border-line" role="tablist">
        {(['xp', 'gold', 'item'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => onTabChange(tab)}
            className={`min-h-[44px] flex-1 px-2 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-primary text-primary-deep'
                : 'text-ink-mute hover:text-ink'
            }`}
          >
            {tab === 'xp' ? 'XP' : tab === 'gold' ? 'Oro' : 'Ítem'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === 'xp' && (
          <XpTab characterId={characterId} onClose={onClose} />
        )}
        {activeTab === 'gold' && (
          <GoldTab characterId={characterId} onClose={onClose} />
        )}
        {activeTab === 'item' && (
          <ItemTab characterId={characterId} worldId={worldId} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// XP tab
// ---------------------------------------------------------------------------

function XpTab({ characterId, onClose }: { characterId: string; onClose: () => void }) {
  const [award, setAward] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseInt(award, 10);
    if (isNaN(parsed)) {
      setError('Ingresá un número entero válido.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await grantXp(characterId, parsed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="xp-award" className="block text-sm font-medium text-ink mb-1">
          XP a otorgar (puede ser negativo para corregir)
        </label>
        <input
          id="xp-award"
          type="number"
          inputMode="numeric"
          value={award}
          onChange={(e) => setAward(e.target.value)}
          placeholder="200"
          required
          className="min-h-[44px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || award === ''}
        className="min-h-[44px] w-full rounded-md border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper transition-colors hover:bg-primary-deep disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Otorgando…' : 'Otorgar XP'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Gold tab
// ---------------------------------------------------------------------------

const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
const COIN_LABELS: Record<typeof COINS[number], string> = {
  cp: 'Cobre (cp)',
  sp: 'Plata (sp)',
  ep: 'Electrum (ep)',
  gp: 'Oro (gp)',
  pp: 'Platino (pp)',
};

function GoldTab({ characterId, onClose }: { characterId: string; onClose: () => void }) {
  const [values, setValues] = useState<Partial<Record<typeof COINS[number], string>>>({});
  const [allowNegative, setAllowNegative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsedDeltas = COINS.reduce<Partial<Record<typeof COINS[number], number>>>(
    (acc, coin) => {
      const raw = values[coin];
      if (raw !== undefined && raw !== '') {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n !== 0) acc[coin] = n;
      }
      return acc;
    },
    {},
  );

  const hasAnyNonZero = Object.keys(parsedDeltas).length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasAnyNonZero) {
      setError('Ingresá al menos una moneda con valor distinto de cero.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await grantGold(characterId, parsedDeltas);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-ink-mute">
        <input
          type="checkbox"
          checked={allowNegative}
          onChange={(e) => setAllowNegative(e.target.checked)}
          className="h-4 w-4"
        />
        Corregir (permite valores negativos)
      </label>

      {COINS.map((coin) => (
        <div key={coin}>
          <label htmlFor={`coin-${coin}`} className="block text-sm font-medium text-ink mb-1">
            {COIN_LABELS[coin]}
          </label>
          <input
            id={`coin-${coin}`}
            type="number"
            inputMode="numeric"
            min={allowNegative ? undefined : 0}
            value={values[coin] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [coin]: e.target.value }))}
            placeholder="0"
            className="min-h-[44px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
          />
        </div>
      ))}

      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !hasAnyNonZero}
        className="min-h-[44px] w-full rounded-md border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper transition-colors hover:bg-primary-deep disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Otorgando…' : 'Otorgar oro'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Item tab
// ---------------------------------------------------------------------------

function ItemTab({
  characterId,
  worldId,
  onClose,
}: {
  characterId: string;
  worldId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompendiumItemHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CompendiumItemHit | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Debounced item search
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
      const hits = await searchCompendiumItems(worldId, trimmed);
      if (reqIdRef.current === myReqId) {
        setResults(hits);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, worldId]);

  function handlePickItem(item: CompendiumItemHit) {
    setPicked(item);
    setQuery(item.name);
    setResults([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) {
      setError('Seleccioná un ítem de la lista.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 999) {
      setError('La cantidad debe ser un número entre 1 y 999.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await grantItem(characterId, { slug: picked.slug, source: picked.source }, qty);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Item search */}
      <div>
        <label htmlFor="item-search" className="block text-sm font-medium text-ink mb-1">
          Buscar ítem
        </label>
        <input
          ref={inputRef}
          id="item-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          placeholder="Espada larga, daga…"
          className="min-h-[44px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
        />
      </div>

      {/* Search results */}
      {query.trim().length > 0 && !picked && (
        <div className="rounded-md border border-line bg-white overflow-hidden">
          {searching && (
            <p className="px-4 py-3 text-sm text-ink-mute">Buscando…</p>
          )}
          {!searching && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-mute">Sin resultados.</p>
          )}
          {results.length > 0 && (
            <ul className="divide-y divide-line max-h-48 overflow-y-auto">
              {results.map((item) => (
                <li key={`${item.slug}|${item.source}`}>
                  <button
                    type="button"
                    onClick={() => handlePickItem(item)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-paper-soft transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-mute">
                        {item.source}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Quantity */}
      <div>
        <label htmlFor="item-quantity" className="block text-sm font-medium text-ink mb-1">
          Cantidad
        </label>
        <input
          id="item-quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="min-h-[44px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !picked}
        className="min-h-[44px] w-full rounded-md border border-primary bg-primary px-4 py-3 text-sm font-semibold text-paper transition-colors hover:bg-primary-deep disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Otorgando…' : 'Otorgar ítem'}
      </button>
    </form>
  );
}
