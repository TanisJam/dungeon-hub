/**
 * Shared SubNav items for DM codex pages.
 * ADR-D3a: single const to prevent drift when adding/removing pills.
 * REQ-DPPMD-CODEX-02: Facciones | NPCs | Quests | Compendio on all DM codex sub-pages.
 */
export const CODEX_DM_SUBNAV_ITEMS: { label: string; href: string }[] = [
  { label: 'Facciones', href: '/codex/facciones' },
  { label: 'NPCs',      href: '/codex/npcs' },
  { label: 'Quests',    href: '/codex/quests' },
  { label: 'Compendio', href: '/codex/compendio' },
];
