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

  // Keep the latest onClose in a ref so the focus/keyboard effect does NOT depend
  // on its identity. Callers usually pass an inline closure (new each render); if
  // onClose were an effect dep, every parent re-render (e.g. typing in a field)
  // would re-run the effect and steal focus back to the first focusable element.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Mount guard — prevents SSR portal creation
  useEffect(() => {
    setMounted(true);
  }, []);

  // Body overflow lock + keyboard handling + focus management.
  // Depends ONLY on `open` — runs once per open/close transition, not on every render.
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
        onCloseRef.current();
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

    // Focus on open: prefer an explicit [data-autofocus] element (e.g. the composer's
    // body textarea — React strips the `autofocus` attr, so we use a data marker),
    // else the first focusable. Runs once per open.
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

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
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the onClick below is a guard,
          not an action — it stops clicks inside the panel reaching a clickable ancestor,
          since React portals bubble through the React tree rather than the DOM tree.
          The keyboard affordances this rule asks for already exist: Escape closes and
          Tab wraps, both wired to a document-level keydown listener in this component.
          An onKeyDown here would stop those events reaching that listener and break
          both; a no-op one would silence the rule without adding anything. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-sm rounded-t-lg bg-surface shadow-stamp-lg max-h-[92vh] overflow-y-auto motion-safe:[animation:v3-sheet-slide-up_var(--dur-base)_var(--ease-out)_both]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      >
        {/* Handle bar — decorative affordance, aria-hidden */}
        <span aria-hidden="true" className="mx-auto mt-2 mb-1 block h-1 w-10 rounded-full bg-ink-mute" />
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
