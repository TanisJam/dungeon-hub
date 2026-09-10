/*
 * tap-targets.public.spec.ts
 *
 * Turns DEV-COMP-03 from a badge a human has to notice into an assertion.
 *
 * /dev/catalog/components already renders every registry entry × buildMatrix
 * combo inside Frame375, and Frame375 already measures every interactive
 * descendant and flags anything under 44×44px. What was missing was anyone
 * failing a build over it: the AccountMenu shipped at 34×34px, was rendered in
 * the catalog the whole time under a "TAP <44px" badge, and still reached an
 * e2e failure in approval-transition-mobile before it was noticed.
 *
 * This spec reads the probe's own output (the data-tap-issue attribute) rather
 * than re-measuring. Re-measuring would put a second copy of the selector and
 * the 44px threshold in the tree, and the two would drift. The probe is the
 * single definition; this is the gate on it.
 *
 * Coverage is whatever the registry covers — ~430 entries today. A component
 * added to _registry.tsx is checked here for free, which is the point: the rule
 * is enforced at the primitive, not re-litigated per screen.
 *
 * Why 44 and not WCAG 2.5.8's 24: CLAUDE.md §2 makes the phone the primary
 * surface, and the codebase already applies 44 in global-error.tsx,
 * not-found.tsx, subclass-picker.tsx (REQ-CLU-SUB-UI-MOBILE), world-switcher,
 * section-affordance and toggle-chip. This is the house rule, not a new one.
 */

import { test, expect } from '@playwright/test';

// The catalog mounts every registry entry in every documented variant, and
// under `next dev` that route compiles on first request. The default 30s budget
// is not enough — see 82e46b6 and sheet-racial-traits.auth.spec.ts.
test.describe.configure({ timeout: 180_000 });

interface TapIssuePayload {
  tag: string;
  text: string;
  w: number;
  h: number;
  entry: string;
  variant: string;
}

test.describe('Touch targets — DEV-COMP-03 over the component registry', () => {
  test('every interactive element in the catalog is at least 44×44px', async ({ page }) => {
    await page.goto('/dev/catalog/components', { waitUntil: 'networkidle', timeout: 120_000 });

    await expect(page.locator('h1', { hasText: 'Components' })).toBeVisible({ timeout: 30_000 });

    // Every frame must report that it has MEASURED before the issues are read.
    // The frames themselves arrive with the server HTML; the probe runs after
    // hydration and a frame of layout, and this page mounts hundreds of client
    // components. An earlier version of this spec waited a flat 3s instead and
    // read zero issues off a page that had 21 — a green run that proved nothing.
    // data-tap-probed is the frame saying "I ran", so counting it against the
    // frame count is the difference between "clean" and "not measured yet".
    await page.waitForFunction(
      () => {
        const frames = document.querySelectorAll('[data-tap-frame]').length;
        const probed = document.querySelectorAll('[data-tap-probed]').length;
        return frames > 100 && probed === frames;
      },
      undefined,
      { timeout: 120_000 },
    );

    const issues: TapIssuePayload[] = await page.$$eval('[data-tap-issue]', (els) =>
      els.map((el) => JSON.parse(el.getAttribute('data-tap-issue') as string)),
    );

    // Group by entry so the failure message is a work list, not 200 lines of noise.
    const byEntry = new Map<string, TapIssuePayload[]>();
    for (const i of issues) {
      const list = byEntry.get(i.entry) ?? [];
      list.push(i);
      byEntry.set(i.entry, list);
    }

    const report = [...byEntry.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([entry, list]) => {
        const shapes = [
          ...new Set(list.map((i) => `<${i.tag}>${i.text ? ` "${i.text}"` : ''} ${i.w}×${i.h}px`)),
        ];
        return `  ${entry} (${list.length})\n${shapes.map((s) => `      ${s}`).join('\n')}`;
      })
      .join('\n');

    expect(
      issues.length,
      issues.length === 0
        ? ''
        : `${issues.length} interactive element(s) under 44×44px across ${byEntry.size} registry entr(ies).\n` +
          `Open http://localhost:3001/dev/catalog/components to see each one flagged in place.\n${report}\n`,
    ).toBe(0);
  });
});
