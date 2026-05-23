'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Global top progress bar. Activates on any client-side navigation
// (<Link> / <a> click) and clears when the URL settles. Server-action
// redirects are covered by the in-place loading indicator inside
// WizardFooterNav and similar pending-aware components.
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const startedRef = useRef(false);

  // Start: a click on an internal anchor.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      // External or non-route links — let the browser handle them.
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (href.startsWith('#')) return;

      // Same URL → no navigation.
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (href === currentPath) return;

      setActive(true);
      startedRef.current = true;
    }

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // Stop: URL changed → navigation finished.
  useEffect(() => {
    if (!startedRef.current) return;
    const t = window.setTimeout(() => {
      setActive(false);
      startedRef.current = false;
    }, 120);
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <div className="h-full w-1/3 animate-[wizard-loading_1.2s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
