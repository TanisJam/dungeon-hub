import { describe, it, expect } from 'vitest';
import { COLORS } from './design-tokens';

/**
 * WCAG AA contrast for the token pairs the UI actually puts together.
 *
 * Measured on production before this guard existed: 43 text nodes across 17
 * routes failed AA, and they were not 43 mistakes — they were 8 distinct token
 * pairs, repeated. The Pill component alone accounted for 16 of them by putting
 * a `*-deep` colour on its matching `*-soft` background in three tones.
 *
 * That is why this checks PAIRS rather than colours: a token is not accessible
 * or inaccessible on its own, only against what it is placed on. A palette
 * change that keeps every hex "nice" can still break every pill.
 *
 * Ratios are computed from lib/design-tokens.ts, which globals.css mirrors and
 * design-system-guard.test.ts keeps in sync — so this guards the real values.
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(hexToRgb(fgHex));
  const l2 = relativeLuminance(hexToRgb(bgHex));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function tokenHex(name: string): string {
  const entry = COLORS.find((t) => t.name === name);
  if (!entry) throw new Error(`Token "${name}" is not in COLORS — did it get renamed?`);
  if (!entry.hex.startsWith('#')) throw new Error(`Token "${name}" is not a plain hex (${entry.hex}); this guard cannot rate it.`);
  return entry.hex;
}

/**
 * Each row is a pair the UI genuinely renders. Adding a row is how a new
 * combination gets protected; the `where` string is for whoever has to find it.
 */
const PAIRS: Array<{ fg: string; bg: string; where: string }> = [
  { fg: 'ink',        bg: 'paper',           where: 'body text on the page' },
  { fg: 'ink',        bg: 'surface',         where: 'body text on a card' },
  { fg: 'ink-soft',   bg: 'paper',           where: 'secondary text on the page' },
  { fg: 'ink-soft',   bg: 'surface',         where: 'secondary text on a card' },
  { fg: 'ink-mute',   bg: 'paper',           where: 'muted text on the page' },
  { fg: 'ink-mute',   bg: 'surface',         where: 'muted text on a card' },
  { fg: 'primary-deep',   bg: 'primary-soft',   where: 'Pill tone="primary"' },
  { fg: 'warning-deep',   bg: 'warning-soft',   where: 'Pill tone="warning"' },
  { fg: 'accent-deep',    bg: 'accent-soft',    where: 'Pill tone="amber"/accent' },
  { fg: 'secondary-deep', bg: 'secondary-soft', where: 'Pill tone="secondary"' },
  { fg: 'secondary',  bg: 'paper',           where: 'the DM role pill label' },
  { fg: 'danger',     bg: 'paper',           where: 'destructive button label' },
  { fg: 'accent',     bg: 'paper',           where: 'accent text on the page' },
  { fg: 'primary',    bg: 'paper',           where: 'primary text on the page' },
];

const AA_NORMAL = 4.5;

describe('WCAG AA contrast for the palette pairs the UI renders', () => {
  it.each(PAIRS)('$fg on $bg ($where) clears AA', ({ fg, bg, where }) => {
    const ratio = contrast(tokenHex(fg), tokenHex(bg));
    expect(
      ratio,
      `${fg} on ${bg} — ${where} — is ${ratio.toFixed(2)}:1, needs ${AA_NORMAL}:1.\n` +
        `Raise the foreground's lightness (keep its hue) until it clears, and mirror the new hex in app/globals.css.`,
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
