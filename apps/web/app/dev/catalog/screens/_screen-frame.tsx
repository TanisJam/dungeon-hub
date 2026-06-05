import type { ReactNode } from 'react';

/**
 * ScreenFrame — a 375px phone silhouette for catalog "screen" reproductions.
 *
 * Renders a faithful but STATIC shell (top header + bottom tab strip) around a
 * scrollable content slot. The real TopBar / TabBar / RoleSwitcher are cataloged
 * separately under Components — here the shell is a silhouette so screen
 * reproductions stay free of auth / cookies / server actions and focus on how the
 * organisms compose into a full mobile screen.
 */

const TABS = ['Inicio', 'Mapa', 'Codex', 'Crónica', 'Mesa'] as const;

interface ScreenFrameProps {
  /** TopBar title. */
  title: string;
  /** TopBar uppercase legend. */
  subtitle?: string;
  /** Shows a static role pill (Jugador / DM) in the header right slot. */
  role?: 'player' | 'dm';
  /** Left-slot affordance: 'crow' (home crow mark) or 'back' (← arrow). */
  lead?: 'crow' | 'back';
  /** Highlighted bottom tab. */
  activeTab?: (typeof TABS)[number];
  /** Hide the bottom tab strip (e.g. wizard / full-bleed flows). */
  showTabBar?: boolean;
  children: ReactNode;
}

export function ScreenFrame({
  title,
  subtitle,
  role,
  lead = 'crow',
  activeTab = 'Inicio',
  showTabBar = true,
  children,
}: ScreenFrameProps) {
  return (
    <div className="mx-auto flex h-[760px] w-[375px] flex-col overflow-hidden rounded-[24px] border border-line bg-paper shadow-md">
      {/* ── static TopBar silhouette ── */}
      <header className="shrink-0 border-b border-line bg-paper/95 px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="shrink-0 text-ink-mute">
            {lead === 'back' ? '←' : '✦'}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold leading-tight text-ink">{title}</h1>
            {subtitle && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">{subtitle}</p>
            )}
          </div>
          {role && (
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-ink-mute">
              {role === 'dm' ? 'DM' : 'Jugador'}
            </span>
          )}
        </div>
      </header>

      {/* ── scrollable content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

      {/* ── static TabBar silhouette ── */}
      {showTabBar && (
        <nav aria-hidden className="shrink-0 border-t border-line bg-paper px-1 py-1">
          <ul className="flex items-stretch justify-between">
            {TABS.map((t) => (
              <li key={t} className="flex-1">
                <div
                  className={`flex flex-col items-center gap-1 rounded-md py-1 text-[9px] font-semibold ${
                    t === activeTab ? 'text-accent' : 'text-ink-mute'
                  }`}
                >
                  <span className="h-4 w-4 rounded-[5px] bg-current opacity-50" />
                  {t}
                </div>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/**
 * ScreenSection — heading + route label above a screen reproduction (or a pair
 * of player/DM variants).
 */
export function ScreenSection({
  name,
  route,
  notes,
  children,
}: {
  name: string;
  route: string;
  notes?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-base font-bold text-ink">{name}</h2>
          <code className="font-mono text-[11px] text-primary-deep">{route}</code>
        </div>
        {notes && <p className="mt-0.5 text-[10px] font-mono text-ink-mute">{notes}</p>}
      </div>
      <div className="flex flex-wrap gap-6">{children}</div>
    </section>
  );
}
