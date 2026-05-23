'use client';

import * as HoverCard from '@radix-ui/react-hover-card';
import { useEffect, useRef } from 'react';
import { TermCard } from './TermCard';
import type { TermEntry } from './types';

export interface TermProps {
  /** Controlled open state — driven by TermProvider state machine */
  open: boolean;
  /**
   * The active [data-compendium-ref] element.
   * Used for positioning the floating card via a hidden overlay trigger.
   */
  anchorEl: Element | null;
  /** Current resolution state */
  state: 'loading' | 'ok' | 'error';
  entry?: TermEntry;
  error?: string;
}

/**
 * Controlled Radix HoverCard.
 *
 * HoverCard v1.x has no virtualRef Anchor — we use a hidden Trigger
 * (aria-hidden, pointer-events:none) positioned near the anchor span.
 * The provider state machine drives open/closed; Radix only handles the
 * floating content portal and animation.
 *
 * Positioning uses an absolute-positioned hidden span rendered inside a
 * fixed-position overlay div that sits atop the anchor element. In jsdom
 * getBoundingClientRect returns zeros, so positioning is a browser-only concern.
 */
export function Term({ open, anchorEl, state, entry, error }: TermProps) {
  const triggerRef = useRef<HTMLAnchorElement>(null);

  // Sync trigger position to anchorEl in the browser (no-op in jsdom)
  useEffect(() => {
    const trigger = triggerRef.current;
    const container = trigger?.parentElement;
    if (!trigger || !container || !anchorEl) return;

    const rect = anchorEl.getBoundingClientRect();
    container.style.position = 'fixed';
    container.style.pointerEvents = 'none';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.width = `${Math.max(rect.width, 1)}px`;
    container.style.height = `${Math.max(rect.height, 1)}px`;
  }, [anchorEl, open]);

  return (
    <HoverCard.Root open={open} openDelay={0} closeDelay={0}>
      {/*
       * Trigger is visually hidden and not interactive — the provider state
       * machine manages open/close, so we don't need Radix's built-in hover.
       */}
      <div
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          width: 0,
          height: 0,
          overflow: 'hidden',
        }}
        aria-hidden
      >
        <HoverCard.Trigger
          ref={triggerRef}
          asChild
          aria-hidden
          tabIndex={-1}
          style={{ display: 'inline-block', width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
          <a />
        </HoverCard.Trigger>
      </div>
      <HoverCard.Portal>
        <HoverCard.Content
          role="dialog"
          side="top"
          align="start"
          sideOffset={4}
          className="z-50"
        >
          <TermCard state={state} entry={entry} error={error} />
          <HoverCard.Arrow className="fill-line" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
