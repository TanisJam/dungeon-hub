/**
 * Design token manifest — single source of truth for the dev catalog tokens page.
 *
 * Token VALUES are mirrored from apps/web/app/globals.css @theme — keep in sync.
 * When you add or change a token in @theme, update this file too.
 *
 * `displayOnly: true` marks entries whose values are not plain 6-hex (e.g. rgba).
 * The WCAG AA contrast helper in tokens/page.tsx skips displayOnly entries.
 */

// ── Colors ──────────────────────────────────────────────────────────────────

export type ColorToken = {
  name: string;
  hex: string;
  note?: string;
  /** True for rgba/non-hex values — WCAG contrast helper skips these. */
  displayOnly?: boolean;
};

export const COLORS: ColorToken[] = [
  { name: 'paper',              hex: '#0B0A12' },
  { name: 'paper-soft',         hex: '#13111C' },
  { name: 'surface',            hex: '#1A1726' },
  { name: 'surface-soft',       hex: '#221E30' },
  { name: 'ink',                hex: '#F4EAD5' },
  { name: 'ink-soft',           hex: '#C9BFA8' },
  { name: 'ink-mute',           hex: '#8B8273' },
  { name: 'line',               hex: '#3A3145' },
  { name: 'line-soft',          hex: '#26212F' },
  { name: 'primary',            hex: '#5BB3C9', note: 'arcane cyan' },
  { name: 'primary-deep',       hex: '#3A8FA8' },
  { name: 'primary-soft',       hex: '#1A2F38' },
  { name: 'accent',             hex: '#D4A24C', note: 'copper' },
  { name: 'accent-deep',        hex: '#A87528' },
  { name: 'accent-soft',        hex: '#3A2D17' },
  // Alpha-derived accent border token (row icons / compendium list)
  { name: 'accent-soft-border', hex: 'rgba(212, 162, 76, 0.25)', displayOnly: true },
  { name: 'secondary',          hex: '#A85A8E', note: 'magenta' },
  { name: 'secondary-deep',     hex: '#7F3F6B' },
  { name: 'secondary-soft',     hex: '#2E1A28' },
  // Alpha-derived secondary tokens (row icons / spell detail background)
  { name: 'secondary-soft-border', hex: 'rgba(168, 90, 142, 0.30)', displayOnly: true },
  { name: 'secondary-soft-bg',     hex: 'rgba(168, 90, 142, 0.22)', displayOnly: true },
  { name: 'success',            hex: '#6BA368' },
  // Alpha-derived success token (hex/poi status pills — B2 pill-consolidation)
  { name: 'success-soft',       hex: 'rgba(107, 163, 104, 0.12)', displayOnly: true },
  { name: 'warning',            hex: '#E0A82E', note: 'hotter amber — distinct from copper accent' },
  { name: 'warning-soft',       hex: '#3A2D17' },
  { name: 'warning-deep',       hex: '#B07A1E' },
  { name: 'danger',             hex: '#CC4444' },
  // Alpha-derived danger tokens (compendium monster rows / form error background)
  { name: 'danger-soft',        hex: 'rgba(204, 68, 68, 0.12)', displayOnly: true },
  { name: 'danger-soft-border', hex: 'rgba(204, 68, 68, 0.25)', displayOnly: true },
  { name: 'on-accent',    hex: '#1A1208', note: 'dark text on accent/copper backgrounds' },
  { name: 'on-secondary', hex: '#1A1208', note: 'dark text on secondary/magenta backgrounds' },
];

// ── Typography ───────────────────────────────────────────────────────────────

export type TypographyToken = { name: string; stack: string; cls: string };

export const FONT_FAMILIES: TypographyToken[] = [
  { name: 'display (font-display)', stack: 'Noto Serif Georgian, Georgia, serif', cls: 'font-display' },
  { name: 'sans (font-sans)',       stack: 'Inter, ui-sans-serif, system-ui, sans-serif', cls: 'font-sans' },
  { name: 'script (font-script)',   stack: 'M PLUS Rounded, system-ui, sans-serif', cls: 'font-script' },
  { name: 'mono (font-mono)',       stack: 'JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace', cls: 'font-mono' },
];

export type ScaleEntry = { name: string; size: string; utility: string };

export const TYPE_SCALE: ScaleEntry[] = [
  { name: 'text-micro',    size: '9px',  utility: 'lh 1.4' },
  { name: 'text-caption',  size: '11px', utility: 'lh 1.4' },
  { name: 'text-eyebrow',  size: '10px', utility: 'sans, 700, uppercase, tracking-wide' },
  { name: 'text-footnote', size: '13px', utility: 'lh 1.45' },
  { name: 'text-body',     size: '15px', utility: 'lh 1.5' },
  { name: 'text-body-lg',  size: '17px', utility: 'lh 1.5' },
  { name: 'text-subhead',  size: '19px', utility: 'lh 1.4' },
  { name: 'text-title',    size: '22px', utility: 'lh 1.3' },
  { name: 'text-headline', size: '26px', utility: 'lh 1.25' },
  { name: 'text-stat',     size: '28px', utility: 'display, 700, tabular-nums' },
  { name: 'text-display',  size: '30px', utility: 'lh 1.2' },
];

// ── Border Radius ─────────────────────────────────────────────────────────────

export type RadiusToken = { name: string; value: string; utilityClass: string };

export const RADII: RadiusToken[] = [
  { name: 'radius-sm',   value: '8px',   utilityClass: 'rounded-sm' },
  { name: 'radius-md',   value: '12px',  utilityClass: 'rounded-md' },
  { name: 'radius-lg',   value: '18px',  utilityClass: 'rounded-lg' },
  { name: 'radius-pill', value: '999px', utilityClass: 'rounded-pill' },
];

// ── Shadows ──────────────────────────────────────────────────────────────────

export type ShadowToken = { name: string; value: string };

export const SHADOWS: ShadowToken[] = [
  { name: 'shadow-stamp-sm', value: '0 1px 2px rgba(0, 0, 0, 0.4)' },
  { name: 'shadow-stamp-md', value: '0 6px 16px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)' },
  { name: 'shadow-stamp-lg', value: '0 16px 40px rgba(0, 0, 0, 0.6)' },
  { name: 'shadow-glow-primary',   value: '0 0 0 1px rgba(91, 179, 201, 0.45), 0 0 24px rgba(91, 179, 201, 0.28)' },
  { name: 'shadow-glow-accent',    value: '0 0 0 1px rgba(212, 162, 76, 0.50), 0 0 16px rgba(212, 162, 76, 0.22)' },
  { name: 'shadow-glow-secondary', value: '0 0 0 1px rgba(168, 90, 142, 0.45), 0 0 16px rgba(168, 90, 142, 0.20)' },
  // Rarity glows (used by inventory rows — DA7)
  { name: 'shadow-glow-rarity-uncommon',  value: '0 0 0 1px rgba(107, 163, 104, 0.45), 0 0 16px rgba(107, 163, 104, 0.20)' },
  { name: 'shadow-glow-rarity-rare',      value: '0 0 0 1px rgba(91, 179, 201, 0.45),  0 0 18px rgba(91, 179, 201, 0.22)' },
  { name: 'shadow-glow-rarity-very-rare', value: '0 0 0 1px rgba(168, 90, 142, 0.50),  0 0 20px rgba(168, 90, 142, 0.24)' },
  { name: 'shadow-glow-rarity-legendary', value: '0 0 0 1px rgba(212, 162, 76, 0.55),  0 0 22px rgba(212, 162, 76, 0.26)' },
  { name: 'shadow-glow-rarity-artifact',  value: '0 0 0 1px rgba(192, 71, 62, 0.60),   0 0 24px rgba(192, 71, 62, 0.30)' },
];

// ── Motion ────────────────────────────────────────────────────────────────────

export type MotionToken = { name: string; type: 'duration' | 'ease'; value: string };

export const MOTION: MotionToken[] = [
  { name: '--dur-fast', type: 'duration', value: '120ms' },
  { name: '--dur-base', type: 'duration', value: '200ms' },
  { name: '--dur-slow', type: 'duration', value: '320ms' },
  { name: '--ease-out',    type: 'ease', value: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  { name: '--ease-in-out', type: 'ease', value: 'cubic-bezier(0.4, 0, 0.2, 1)' },
];
