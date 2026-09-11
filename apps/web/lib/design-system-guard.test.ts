/**
 * Design-system regression guard (audit F2 step 5).
 *
 * `app/globals.css` defines a semantic token vocabulary and forbids raw Tailwind
 * palette classes, but nothing enforced it, so light-theme leftovers accumulated:
 * a `bg-white` confirm modal with cream text on it, pink error cards, and
 * Tailwind's default shadows, which are tuned for a light page and mostly vanish
 * on ours. See docs/audit/ui-craft-2026-09-10/README.md, finding F2.
 *
 * This test greps the shipped source and fails with the offending file:line so a
 * regression names itself. `app/dev/**` is the token catalog and is exempt by
 * design: it has to render the raw values to show them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB_ROOT = join(import.meta.dirname, '..');
const SCANNED_DIRS = ['app', 'components'] as const;

/** Directories that never ship to a player-facing screen. */
const EXEMPT_DIR = join('app', 'dev');

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      collectSourceFiles(full, found);
      continue;
    }
    if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue;
    if (entry.includes('.test.')) continue;
    if (relative(WEB_ROOT, full).startsWith(EXEMPT_DIR)) continue;
    found.push(full);
  }
  return found;
}

/**
 * Strip comments so a line explaining a past migration ("was rounded -> rounded-pill")
 * does not trip a rule that is about rendered classNames.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly fix: string;
}

const RULES: readonly Rule[] = [
  {
    name: 'raw Tailwind palette colour',
    pattern:
      /\b(?:bg|text|border|ring|from|to|via|divide|outline|decoration|accent|caret|fill|stroke)-(?:zinc|gray|slate|amber|blue|red|green|yellow|emerald|indigo|purple|neutral|stone|sky|rose|orange|teal|cyan|lime|fuchsia|pink|violet)-\d{2,3}\b/g,
    fix: 'use a semantic token: danger / warning / success / primary / accent / secondary / arcane, or a neutral (paper, surface, ink, line).',
  },
  {
    name: 'solid bg-white',
    // bg-white/10 and friends are deliberate alpha overlays on gradients; only the
    // solid fill is a light-theme leftover.
    pattern: /\bbg-white(?!\/)\b/g,
    fix: 'use bg-surface, bg-surface-soft or bg-paper-soft.',
  },
  {
    name: "Tailwind's default shadow scale",
    pattern: /\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    fix: 'use shadow-stamp-sm / shadow-stamp-md / shadow-stamp-lg.',
  },
  {
    name: 'bare rounded',
    // `rounded` on its own is Tailwind's 4px default and sits off the project
    // scale (sm 8 / md 12 / lg 18 / pill).
    pattern: /(?<![\w-])rounded(?![\w-])/g,
    fix: 'use rounded-sm / rounded-md / rounded-lg / rounded-pill.',
  },
];

function findViolations(rule: Rule): string[] {
  const hits: string[] = [];
  for (const dir of SCANNED_DIRS) {
    for (const file of collectSourceFiles(join(WEB_ROOT, dir))) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        const matches = line.match(rule.pattern);
        if (matches) {
          hits.push(`${relative(WEB_ROOT, file)}:${i + 1}  ${matches.join(', ')}`);
        }
      });
    }
  }
  return hits;
}

describe('design-system guard — app/ and components/ outside app/dev', () => {
  for (const rule of RULES) {
    it(`has no ${rule.name}`, () => {
      const violations = findViolations(rule);
      expect(
        violations,
        `\n${violations.length} use(s) of ${rule.name}. ${rule.fix}\n\n${violations.join('\n')}\n`,
      ).toEqual([]);
    });
  }
});

describe('design-token mirror', () => {
  /**
   * globals.css says the @theme values are "mirrored for dev catalog in
   * lib/design-tokens.ts — keep in sync", but nothing checked it, so the catalog
   * could silently drift from what the app actually renders.
   */
  it('every @theme --color-* token appears in lib/design-tokens.ts', async () => {
    const css = readFileSync(join(WEB_ROOT, 'app', 'globals.css'), 'utf8');
    const themeBlock = css.slice(css.indexOf('@theme {'), css.indexOf('/* ── Type-scale utilities'));
    const declared = [...themeBlock.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(20);

    const { COLORS } = await import('./design-tokens');
    const mirrored = new Set(COLORS.map((t) => t.name));
    const missing = declared.filter((name) => !mirrored.has(name));

    expect(
      missing,
      `\nglobals.css declares ${missing.length} colour token(s) that lib/design-tokens.ts does not mirror: ${missing.join(', ')}\n`,
    ).toEqual([]);
  });
});
