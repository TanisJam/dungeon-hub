/**
 * Map top-offset regression guard (fix/topbar-height-token).
 *
 * The TopBar's height is NOT a constant — it carries device-dependent
 * safe-area padding and a worldSwitcher grows it on pages that pass one
 * (components/layout/topbar-height-probe.tsx) — so any fixed-position layout
 * under it that hardcodes a pixel top offset silently drifts out of sync
 * with the real header. That is exactly what happened after audit finding
 * F5 grew the header to 88px while six call sites kept assuming a ~56px
 * TopBar via `top-[120px]` / `top: 'calc(56px + 8px)'`: 24px of the
 * "Ver lista de hexes" button (data-testid="hex-list-access") ended up
 * under the header, untappable at its center, and e2e/mapa.auth.spec.ts:783
 * failed for 30s waiting for it to become visible/stable.
 *
 * This test greps the map screen's source for a hardcoded viewport-relative
 * top offset and fails with the offending file:line so a regression names
 * itself, the same way design-system-guard.test.ts does for color/shadow/
 * radius classes. `app/dev/**` is the token catalog and is exempt by design
 * there too — kept here for consistency even though it sits outside the
 * directories this guard scans.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB_ROOT = join(import.meta.dirname, '..');
const SCANNED_DIRS = [join('components', 'world', 'map'), join('app', 'mapa')] as const;

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
 * Strip comments so prose explaining the fix — which necessarily names the
 * old hardcoded value for context — doesn't trip a rule that is about
 * rendered code, not history.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
}

const RULES: readonly Rule[] = [
  {
    name: 'hardcoded Tailwind top-[Npx] offset',
    pattern: /\btop-\[\d+px\]/g,
  },
  {
    name: "hardcoded inline style top: 'calc(Npx …)'",
    pattern: /top:\s*['"]calc\(\d+px/g,
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

describe('map top-offset guard — components/world/map/** and app/mapa/**', () => {
  for (const rule of RULES) {
    it(`has no ${rule.name}`, () => {
      const violations = findViolations(rule);
      expect(
        violations,
        `\n${violations.length} use(s) of ${rule.name}. The TopBar's height is not ` +
          `a constant (device safe-area padding, worldSwitcher growth) — use ` +
          `top-[var(--topbar-h)] or calc(var(--topbar-h) + …) instead, published by ` +
          `components/layout/topbar-height-probe.tsx.\n\n${violations.join('\n')}\n`,
      ).toEqual([]);
    });
  }
});
