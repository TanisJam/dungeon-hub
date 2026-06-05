import Link from 'next/link';

// ---------------------------------------------------------------------------
// Player Codex grid — 6-category nav links.
// codex-rehome ADR-4 / REQ-GRID-01 / REQ-GRID-02.
//
// Design decisions:
// - grid-cols-1 sm:grid-cols-2 (mobile-first: single column at 375px).
// - Each card min-h-[80px] ≥44px tap target (REQ-GRID-02).
// - No count badges (Stage 2 decision: nav links only).
// - href /codex/:kind — kind matches CATEGORY_CONFIG keys used by [kind] page.
// ---------------------------------------------------------------------------

interface CategoryCard {
  label: string;
  href: string;
  emoji: string;
}

const PLAYER_CODEX_CATEGORIES: CategoryCard[] = [
  { label: 'Monstruos',  href: '/codex/monsters',     emoji: '🐉' },
  { label: 'Items',      href: '/codex/items',         emoji: '⚔️' },
  { label: 'Hechizos',   href: '/codex/spells',        emoji: '✨' },
  { label: 'Razas',      href: '/codex/races',         emoji: '🧝' },
  { label: 'Clases',     href: '/codex/classes',       emoji: '🛡️' },
  { label: 'Trasfondos', href: '/codex/backgrounds',   emoji: '📜' },
  { label: 'Dotes',      href: '/codex/feats',         emoji: '⭐' },
  { label: 'Estados',    href: '/codex/conditions',    emoji: '⚡' },
];

/**
 * PlayerCodexGrid — 8 nav-link cards for the player Codex landing page.
 * Server Component (no state — pure links).
 * REQ-GRID-01: category cards always visible (no gating). Feats/Conditions
 * added (#3.3) — they reuse CATEGORY_CONFIG so /codex/{feats,conditions} work.
 * REQ-GRID-02: grid-cols-1 at 375px, min-h-[80px] per card.
 */
export function PlayerCodexGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
      {PLAYER_CODEX_CATEGORIES.map(({ label, href, emoji }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-[80px] items-center gap-3 rounded-lg border border-line bg-paper p-4 font-sans font-medium text-ink transition-colors hover:bg-paper-soft active:bg-paper-soft"
        >
          <span aria-hidden="true" className="text-2xl leading-none">{emoji}</span>
          <span>{label}</span>
        </Link>
      ))}
    </div>
  );
}
