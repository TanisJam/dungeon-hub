'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * TopbarHeightProbe — headless client island that publishes the TopBar's
 * real, rendered height as `--topbar-h` on the document root.
 *
 * Why this has to be measured at runtime instead of a constant: the
 * header's height genuinely varies. It carries
 * `padding-top: calc(env(safe-area-inset-top, 0px) + 12px)` (device-dependent),
 * and since audit finding F5 a page that passes a worldSwitcher renders it
 * under the title, growing the header on those pages only. Any hardcoded
 * pixel value is wrong on some page or some device — that mismatch is
 * exactly the class of bug this component exists to prevent
 * (see fix/topbar-height-token, and world-map-leaflet.tsx which used to
 * hardcode `top-[120px]` assuming a ~56px header).
 *
 * Finds the header via the `data-app-topbar` hook (components/layout/topbar.tsx)
 * and observes it with a ResizeObserver so `--topbar-h` stays correct across
 * safe-area changes (rotation) and worldSwitcher-driven height changes.
 * Re-queries on every pathname change because App Router route transitions
 * can unmount/remount the header (e.g. navigating to/from a standalone route
 * that renders no TopBar at all — lib/route-chrome.ts).
 *
 * Renders nothing. Guards for the header being absent so standalone routes
 * don't throw.
 */
export function TopbarHeightProbe() {
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname isn't read in the body — it exists purely to re-run this effect on route transitions, matching the precedent in components/layout/nav-progress.tsx.
  useEffect(() => {
    let observed: HTMLElement | null = null;

    // A zero height is never a real topbar — it is what you read while the
    // element is hidden, which App Router does to the outgoing tree during a
    // route transition. Publishing it pins every offset derived from this
    // variable to the top of the viewport, which is worse than not measuring
    // at all: the first version of this component did exactly that and pushed
    // the /mapa hex-list button from 24px under the header to 80px under it.
    // So a non-positive reading is discarded and the last good value (or the
    // :root fallback) stands.
    const publish = () => {
      if (!observed) return;
      const height = observed.getBoundingClientRect().height;
      if (height <= 0) return;
      document.documentElement.style.setProperty('--topbar-h', `${height}px`);
    };

    const resizeObserver = new ResizeObserver(publish);

    // The header is rendered by the page, not by the persistent chrome, so the
    // node is REPLACED rather than updated — most visibly when a segment's
    // loading.tsx renders its own AppShell (a shorter header, no worldSwitcher)
    // and the real page then swaps it. A ResizeObserver left pointing at the
    // old node never fires again, which is how this shipped a stale 69px while
    // the live header measured 88px. So re-target whenever the node identity
    // changes, not just when the pathname does.
    const retarget = () => {
      const header = document.querySelector<HTMLElement>('[data-app-topbar]');
      if (header === observed) return;
      if (observed) resizeObserver.unobserve(observed);
      observed = header;
      if (header) {
        resizeObserver.observe(header);
        publish();
      }
    };

    // Coalesce to one check per frame: the mutation observer below watches the
    // whole subtree, and re-querying on every batch during a map render would
    // be real work for no extra correctness.
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        retarget();
        publish();
      });
    };

    retarget();
    schedule();

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [pathname]);

  return null;
}
