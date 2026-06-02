'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TermCard } from './TermCard';
import type { TermEntry } from './types';

export interface TermProps {
  /** Controlled open state — driven by TermProvider state machine */
  open: boolean;
  /**
   * The active [data-compendium-ref] element.
   * Used to compute viewport-relative position for the floating card.
   */
  anchorEl: Element | null;
  /** Current resolution state */
  state: 'loading' | 'ok' | 'error';
  entry?: TermEntry;
  error?: string;
  /** Called when the pointer enters the card content — provider cancels close timer */
  onCardPointerEnter?: () => void;
  /** Called when the pointer leaves the card content — provider starts close timer */
  onCardPointerLeave?: () => void;
}

/** Card width in px — must match the w-80 class on TermCard (320px). */
const CARD_WIDTH = 320;
/** Horizontal margin kept from viewport edges (px). */
const VIEWPORT_MARGIN = 8;
/** Vertical gap between anchor and card (px). */
const SIDE_OFFSET = 4;
/** Minimum top space before the card flips to below-anchor placement. */
const MIN_TOP_SPACE = 80;

interface CardPosition {
  top: number;
  left: number;
  /** true = card sits above anchor, false = below */
  above: boolean;
}

function computePosition(anchorEl: Element): CardPosition {
  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;

  // Prefer above the anchor; flip to below if there is not enough space.
  const above = rect.top > MIN_TOP_SPACE;

  // Vertical: anchor top edge minus offset (for above), or anchor bottom edge plus offset (for below).
  // We don't know card height at compute time — use a safe estimate for above placement.
  const top = above
    ? rect.top - SIDE_OFFSET  // translateY(-100%) in CSS handles the actual shift
    : rect.bottom + SIDE_OFFSET;

  // Horizontal: align start to anchor left, clamped inside viewport.
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, vw - CARD_WIDTH - VIEWPORT_MARGIN),
  );

  return { top, left, above };
}

/**
 * Controlled floating card, portaled to document.body.
 *
 * Why portal-to-body instead of Radix HoverCard:
 *   The V3Sheet panel has `animation: v3-sheet-slide-up … fill-mode:both`,
 *   whose `to` state is `transform: translateY(0)`. CSS transforms create a
 *   new containing block for `position:fixed` descendants, breaking any fixed
 *   child's viewport-relative coordinates. Portaling to document.body (outside
 *   the transformed sheet panel) and computing position from
 *   anchorEl.getBoundingClientRect() gives correct viewport-relative placement
 *   on both desktop and mobile, regardless of any scroll or transform on
 *   ancestor elements.
 */
export function Term({
  open,
  anchorEl,
  state,
  entry,
  error,
  onCardPointerEnter,
  onCardPointerLeave,
}: TermProps) {
  const [pos, setPos] = useState<CardPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  // SSR guard — createPortal must not run on the server.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Recompute position whenever the anchor or open state changes.
  useEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    setPos(computePosition(anchorEl));
  }, [open, anchorEl]);

  if (!mounted || !open || pos === null) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    // Translate upward when placed above anchor so the card bottom aligns with anchor top.
    transform: pos.above ? 'translateY(-100%)' : 'translateY(0)',
    zIndex: 9999,
    // Prevent the card itself from triggering pointer-leave on the anchor.
    pointerEvents: 'auto',
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      data-term-card
      style={style}
      onPointerEnter={(e) => {
        // Touch: pointerleave fires immediately after touchend, which
        // would close the card. Skip enter→start cycle on touch.
        if (e.pointerType === 'touch') return;
        onCardPointerEnter?.();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'touch') return;
        onCardPointerLeave?.();
      }}
    >
      <TermCard state={state} entry={entry} error={error} />
    </div>,
    document.body,
  );
}
