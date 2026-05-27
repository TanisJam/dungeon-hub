'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

interface V3SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Optional id for the internal heading element (used for aria-labelledby). */
  labelledBy?: string;
  children: ReactNode;
}

/**
 * V3Sheet — bottom-modal client component.
 * Portal-based (inserted into document.body), mount-guarded (SSR-safe),
 * focus-trapped, and accessible (role=dialog + aria-modal + aria-labelledby).
 *
 * Design: docs/design_handoff_dungeon_hub/README.md § Bottom sheets.
 */
export function V3Sheet({ open, onClose, title, labelledBy, children }: V3SheetProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Mount guard — prevents SSR portal creation
  useEffect(() => {
    setMounted(true);
  }, []);

  // Body overflow lock + keyboard handling + focus management
  useEffect(() => {
    if (!open) return;

    // Store element to restore focus to on close
    restoreRef.current = document.activeElement as HTMLElement | null;

    // Body overflow lock
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !panelRef.current) return;

      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes.length) {
        e.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);

    // Focus first focusable element on open
    requestAnimationFrame(() => {
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      nodes?.[0]?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  // Use provided labelledBy or generate a stable id from title
  const headingId = labelledBy ?? 'v3-sheet-title';

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-paper/80 backdrop-blur-sm"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-sm rounded-t-lg bg-surface shadow-stamp-lg max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      >
        {title && (
          <h2 id={headingId} className="px-4 pt-4 font-display text-lg text-ink">
            {title}
          </h2>
        )}
        <div className="p-4">{children}</div>
      </div>
    </>,
    document.body,
  );
}
