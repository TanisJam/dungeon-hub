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

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname isn't read in the body — it exists purely to re-run this effect on route transitions, since App Router can unmount/remount the <header data-app-topbar> (e.g. navigating to/from a standalone route with no TopBar — lib/route-chrome.ts) and a detached ResizeObserver target stops firing.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-topbar]');
    if (!header) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        '--topbar-h',
        `${header.getBoundingClientRect().height}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
