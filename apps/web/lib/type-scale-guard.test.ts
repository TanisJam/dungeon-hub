/**
 * Type-scale regression guard (audit F3, step 5).
 *
 * `app/globals.css` defines a named type-scale (`text-micro` … `text-display`,
 * `text-eyebrow`, `text-stat`, `text-label`), and F3 migrated every existing
 * `text-[Npx]` arbitrary onto one of those tokens. Nothing enforced adoption
 * before this test, so raw pixel sizes crept back in one component at a time —
 * this greps the shipped source and fails with the offending file:line so a
 * regression names itself. See docs/audit/ui-craft-2026-09-10/README.md, F3.
 *
 * `app/dev/**` is the token catalog and is exempt by design: it has to render
 * the raw values to show them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB_ROOT = join(import.meta.dirname, '..');
const SCANNED_DIRS = ['app', 'components'] as const;

/** Directories that never ship to a player-facing screen. */
const EXEMPT_DIR = join('app', 'dev');

/**
 * Known, reported holdouts — NOT a place to add new exceptions.
 *
 * Both sites render a user-supplied name (`characterName` / `name`), never a
 * number, in a heading that already carries `font-display` + `font-bold`
 * explicitly. `text-stat` (28px) also forces `font-variant-numeric:
 * tabular-nums`, which is only ever "right" for a number readout (F3 brief) —
 * a player name can contain digits, so applying it here would be a real,
 * data-dependent rendering change, not the mechanical/neutral migration this
 * guard exists to protect. Work unit 3 (topbar/section-head/body hierarchy
 * pass) or a follow-up decision on hero-name treatment resolves these; until
 * then they are intentionally left as `text-[28px]`.
 */
const KNOWN_HOLDOUTS: ReadonlySet<string> = new Set([
  'components/wizard/published-splash.tsx',
  'components/wizard/review-banner.tsx',
]);

const TOKEN_FOR_SIZE: Record<string, string> = {
  '9px': 'text-micro',
  '10px': 'text-eyebrow (uppercase labels) or text-label (plain)',
  '11px': 'text-caption',
  '13px': 'text-footnote',
  '15px': 'text-body',
  '17px': 'text-body-lg',
  '19px': 'text-subhead',
  '22px': 'text-title',
  '26px': 'text-headline',
  '28px': 'text-stat (number readouts only)',
  '30px': 'text-display',
};

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

const ARBITRARY_TEXT_SIZE = /text-\[(\d+)px\]/g;

function findViolations(): string[] {
  const hits: string[] = [];
  for (const dir of SCANNED_DIRS) {
    for (const file of collectSourceFiles(join(WEB_ROOT, dir))) {
      const relPath = relative(WEB_ROOT, file);
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const match of line.matchAll(ARBITRARY_TEXT_SIZE)) {
          const size = `${match[1]}px`;
          if (KNOWN_HOLDOUTS.has(relPath) && size === '28px') continue;
          const token = TOKEN_FOR_SIZE[size] ?? 'a named text-* scale token (see app/globals.css)';
          hits.push(`${relPath}:${i + 1}  ${match[0]} → use ${token}`);
        }
      });
    }
  }
  return hits;
}

describe('type-scale guard — app/ and components/ outside app/dev', () => {
  it('has no arbitrary text-[Npx] size', () => {
    const violations = findViolations();
    expect(
      violations,
      `\n${violations.length} arbitrary text-[Npx] size(s) found outside the named type scale. ` +
        `Use the matching token from app/globals.css instead.\n\n${violations.join('\n')}\n`,
    ).toEqual([]);
  });
});
