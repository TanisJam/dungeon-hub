'use client';

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { fetchTermEntry } from './fetch';
import { parseRefKey, normalizeRefKey, SUPPORTED_KINDS } from './registry';
import { Term } from './Term';
import type { Cache, TermFetchResult, MockResolver } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TermProviderProps {
  children: ReactNode;
  /** null/undefined → all refs are inert */
  campaignId: string | null | undefined;
  /** null/undefined/empty → all refs are inert, no fetch made */
  accessToken: string | null | undefined;
  /** Defaults to env.API_URL (NEXT_PUBLIC_API_URL) */
  apiBaseUrl?: string;
  /** Open delay in ms (default 120) */
  openDelayMs?: number;
  /** Close delay in ms (default 300) */
  closeDelayMs?: number;
  /** Dev-only: bypass fetch, use this resolver instead */
  mockMode?: false | MockResolver;
}

type ProviderStatus = 'idle' | 'opening' | 'open' | 'closing';

interface ProviderState {
  status: ProviderStatus;
  anchorEl: Element | null;
  refKey: string | null;
  cardState: 'loading' | 'ok' | 'error';
  entry?: import('./types').TermEntry;
  error?: string;
}

const IDLE_STATE: ProviderState = {
  status: 'idle',
  anchorEl: null,
  refKey: null,
  cardState: 'loading',
  entry: undefined,
  error: undefined,
};

// ---------------------------------------------------------------------------
// TermProvider
// ---------------------------------------------------------------------------

/**
 * Client component. Attaches a single set of delegated event listeners to its
 * container element. Drives a single controlled <Term> HoverCard based on the
 * current state machine status.
 *
 * State machine: idle ↔ opening ↔ open ↔ closing
 */
export function TermProvider({
  children,
  campaignId,
  accessToken,
  apiBaseUrl,
  openDelayMs = 120,
  closeDelayMs = 300,
  mockMode,
}: TermProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Promise-keyed cache: refKey → Promise<TermFetchResult>
  const cache = useRef<Cache>(new Map());

  const [state, setState] = useState<ProviderState>(IDLE_STATE);

  // Timers
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Auth guard: if no accessToken, provider is completely inert
  // -------------------------------------------------------------------------
  const isActive = Boolean(accessToken);

  // -------------------------------------------------------------------------
  // Fetch / resolve helper
  // -------------------------------------------------------------------------
  const resolveRef = useCallback(
    (el: Element, rawRef: string): void => {
      const parsed = parseRefKey(rawRef);
      if (!parsed) return;
      if (!SUPPORTED_KINDS.has(parsed.kind)) return;

      const refKey = normalizeRefKey(parsed.kind, parsed.slug, parsed.source);

      if (!cache.current.has(refKey)) {
        // Build the fetch promise (or mock)
        let promise: Promise<TermFetchResult>;

        if (mockMode) {
          promise = Promise.resolve(mockMode(refKey));
        } else {
          promise = fetchTermEntry(rawRef, {
            apiBaseUrl: apiBaseUrl ?? '',
            campaignId: campaignId ?? '',
            accessToken: accessToken ?? '',
          });
        }

        cache.current.set(refKey, promise);
      }

      // Transition to opening; set anchor
      setState({
        status: 'opening',
        anchorEl: el,
        refKey,
        cardState: 'loading',
        entry: undefined,
        error: undefined,
      });

      // Resolve the promise and update state
      cache.current.get(refKey)!.then((result) => {
        setState((prev) => {
          // Only update if this refKey is still the current one
          if (prev.refKey !== refKey) return prev;
          if (result.kind === 'ok') {
            return {
              ...prev,
              cardState: 'ok',
              entry: result.entry,
              error: undefined,
            };
          } else {
            return {
              ...prev,
              cardState: 'error',
              entry: undefined,
              error: result.message,
            };
          }
        });
      });
    },
    [apiBaseUrl, campaignId, accessToken, mockMode],
  );

  // -------------------------------------------------------------------------
  // Clear timers helper
  // -------------------------------------------------------------------------
  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Cancel any pending close — used when the pointer enters the card itself.
  const cancelCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Start the close timer — used when the pointer leaves the card.
  const startCloseTimer = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setState(IDLE_STATE);
    }, closeDelayMs);
  }, [closeDelayMs]);

  // -------------------------------------------------------------------------
  // Event delegation handlers
  // -------------------------------------------------------------------------

  const handlePointerOver = useCallback(
    (e: Event) => {
      if (!isActive) return;

      const target = e.target as Element;
      const refEl = target.closest('[data-compendium-ref]');
      if (!refEl) return;

      const rawRef = refEl.getAttribute('data-compendium-ref') ?? '';
      const parsed = parseRefKey(rawRef);
      if (!parsed || !SUPPORTED_KINDS.has(parsed.kind)) return;

      clearTimers();

      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        resolveRef(refEl, rawRef);
        setState((prev) => {
          if (prev.refKey === normalizeRefKey(parsed.kind, parsed.slug, parsed.source)) {
            return { ...prev, status: 'open' };
          }
          return { ...prev, status: 'open' };
        });
      }, openDelayMs);
    },
    [isActive, clearTimers, resolveRef, openDelayMs],
  );

  const handlePointerOut = useCallback(
    (e: Event) => {
      if (!isActive) return;

      // Touch: pointerleave fires after touchend (finger lifts). Ignoring it
      // here lets the card stay open so the user can scroll/select inside.
      // Touch dismissal is handled by the global pointerdown listener below.
      const pe = e as PointerEvent;
      if (pe.pointerType === 'touch') return;

      const target = e.target as Element;
      const refEl = target.closest('[data-compendium-ref]');
      if (!refEl) return;

      // If we're still in opening phase, cancel
      if (openTimer.current) {
        clearTimers();
        setState(IDLE_STATE);
        return;
      }

      // Start close timer
      clearTimers();
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setState(IDLE_STATE);
      }, closeDelayMs);
    },
    [isActive, clearTimers, closeDelayMs],
  );

  // Global tap/click-outside: closes when the user presses anywhere that is
  // neither a ref span nor the card content. Essential for touch (where
  // pointerleave is ignored above) and a nice mouse affordance too.
  const handleGlobalPointerDown = useCallback(
    (e: Event) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest('[data-compendium-ref]')) return;
      if (target.closest('[data-term-card]')) return;
      clearTimers();
      setState(IDLE_STATE);
    },
    [clearTimers],
  );

  const handleFocusIn = useCallback(
    (e: Event) => {
      if (!isActive) return;

      const target = e.target as Element;
      const refEl = target.closest('[data-compendium-ref]');
      if (!refEl) return;

      const rawRef = refEl.getAttribute('data-compendium-ref') ?? '';
      const parsed = parseRefKey(rawRef);
      if (!parsed || !SUPPORTED_KINDS.has(parsed.kind)) return;

      clearTimers();
      // Focus is instant — no delay
      resolveRef(refEl, rawRef);
      setState((prev) => ({ ...prev, status: 'open' }));
    },
    [isActive, clearTimers, resolveRef],
  );

  const handleFocusOut = useCallback(
    (e: Event) => {
      if (!isActive) return;

      const target = e.target as Element;
      const refEl = target.closest('[data-compendium-ref]');
      if (!refEl) return;

      clearTimers();
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setState(IDLE_STATE);
      }, closeDelayMs);
    },
    [isActive, clearTimers, closeDelayMs],
  );

  const handleKeyDown = useCallback(
    (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') {
        clearTimers();
        setState(IDLE_STATE);
      }
    },
    [clearTimers],
  );

  // -------------------------------------------------------------------------
  // Attach / detach delegated listeners on the container
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('pointerover', handlePointerOver);
    container.addEventListener('pointerout', handlePointerOut);
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);

    // Escape is global (card may have focus outside the container)
    document.addEventListener('keydown', handleKeyDown);
    // Tap/click outside dismisses (essential for touch dismissal)
    document.addEventListener('pointerdown', handleGlobalPointerDown);

    return () => {
      container.removeEventListener('pointerover', handlePointerOver);
      container.removeEventListener('pointerout', handlePointerOut);
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleGlobalPointerDown);
    };
  }, [handlePointerOver, handlePointerOut, handleFocusIn, handleFocusOut, handleKeyDown, handleGlobalPointerDown]);

  // Cleanup timers on unmount
  useEffect(() => () => { clearTimers(); }, [clearTimers]);

  // -------------------------------------------------------------------------
  // Determine whether to render the HoverCard
  // -------------------------------------------------------------------------
  const isOpen = state.status === 'open' || state.status === 'closing';

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      {children}
      {isOpen && state.anchorEl && (
        <Term
          open={isOpen}
          anchorEl={state.anchorEl}
          state={state.cardState}
          entry={state.entry}
          error={state.error}
          onCardPointerEnter={cancelCloseTimer}
          onCardPointerLeave={startCloseTimer}
        />
      )}
    </div>
  );
}
