/**
 * Shared SubNav items for DM Herramientas pages.
 * Biblioteca W1 (ADR-2): moved from /codex/_components/codex-subnav-items.ts.
 *
 * "Compendio" pill removed — DM uses the Biblioteca tab (REQ-NAV-01).
 * Hrefs updated to /herramientas/* (REQ-DMTOOLS-01).
 */
export const HERRAMIENTAS_SUBNAV_ITEMS: { label: string; href: string }[] = [
  { label: 'Facciones', href: '/herramientas/facciones' },
  { label: 'NPCs',      href: '/herramientas/npcs' },
  { label: 'Quests',    href: '/herramientas/quests' },
  { label: 'Tienda',    href: '/herramientas/tienda' },
];
