/**
 * classifyRoute() — pure pathname → app-chrome classifier (audit F1).
 *
 * Before this change, `AppShell` (DesktopSidebar + TopBar + main + TabBar)
 * was rendered inside each of the ~30 authenticated `page.tsx` files, so
 * every navigation destroyed and recreated the nav `<nav>` elements even
 * though they render identically across pages. The fix mounts the nav
 * chrome ONCE in the root layout (`app/layout.tsx`) via `AppChrome`, which
 * calls this function to decide, per-pathname, whether to render it.
 *
 * Kept pure and framework-free (no React/Next imports) so it is trivially
 * unit-testable, and so the exact same logic can be checked against every
 * real `page.tsx` on disk — see route-chrome.test.ts's drift guard, which
 * fails by name when a new route is added without declaring its chrome.
 */

export type RouteChrome = {
  /** Renders DesktopSidebar + the md:grid wrapper around children. */
  shell: boolean;
  /** Renders the mobile TabBar. Only meaningful when shell is true. */
  tabBar: boolean;
};

/** Exact-match standalone paths — no app chrome at all. */
export const STANDALONE_EXACT_PATHS: readonly string[] = ['/'];

/**
 * Prefix-match standalone paths — no app chrome at all. Matched on a segment
 * boundary (`pathname === prefix` or `pathname.startsWith(prefix + '/')`),
 * so e.g. `/linkage` does NOT match the `/link` prefix.
 */
export const STANDALONE_PREFIXES: readonly string[] = ['/auth', '/invite', '/link', '/dev'];

/**
 * Routes that keep the desktop sidebar (shell: true) but hide the mobile
 * TabBar — the character wizard and level-up flows, which previously
 * suppressed it via AppShell's now-removed `showTabBar={false}` prop.
 * Matched with `[^/]+` for the dynamic `:id` segment, anchored so a route
 * merely starting with the same characters (e.g. a hypothetical
 * `/characters/abc/wizardry`) does not match.
 */
export const TAB_BAR_HIDDEN_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: '/characters/:id/wizard', pattern: /^\/characters\/[^/]+\/wizard(\/|$)/ },
  { label: '/characters/:id/level-up', pattern: /^\/characters\/[^/]+\/level-up(\/|$)/ },
];

function matchesSegmentPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyRoute(pathname: string): RouteChrome {
  const isStandalone =
    STANDALONE_EXACT_PATHS.includes(pathname) ||
    STANDALONE_PREFIXES.some((prefix) => matchesSegmentPrefix(pathname, prefix));

  if (isStandalone) {
    return { shell: false, tabBar: false };
  }

  const hidesTabBar = TAB_BAR_HIDDEN_PATTERNS.some(({ pattern }) => pattern.test(pathname));

  return { shell: true, tabBar: !hidesTabBar };
}
