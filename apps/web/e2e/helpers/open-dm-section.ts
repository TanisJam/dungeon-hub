import type { Page } from '@playwright/test';

/**
 * Open the sheet's "Como DM" disclosure if it is present and closed.
 *
 * Audit F8 grouped the DM affordances — "Devolver a borrador", "Aprobar",
 * "Otorgar" — under a collapsed section, so the sheet stops presenting a
 * destructive action at the same weight as "Descanso corto". Reaching those
 * controls is now a real user step, and a spec that skips it is testing a
 * screen that no longer exists.
 *
 * The section defaults OPEN when the character is pending_approval (the DM has
 * a decision waiting on that sheet), so approval specs generally do not need
 * this. Grant specs, which act on an active character, do.
 *
 * Safe to call unconditionally: it does nothing when the section is absent
 * (a player's view) or already open.
 */
export async function openDmSection(page: Page): Promise<void> {
  const details = page.locator('details:has(summary:has-text("Como DM"))');
  if ((await details.count()) === 0) return;
  if ((await details.first().getAttribute('open')) !== null) return;
  await details.first().locator('summary').click();
  // Wait for the disclosure to actually be open rather than for a tick to pass:
  // the click is what the user does, `open` is what proves it landed.
  await details.first().waitFor({ state: 'attached' });
  await page.waitForFunction(
    () => {
      const el = [...document.querySelectorAll('details')].find((d) =>
        d.querySelector('summary')?.textContent?.includes('Como DM'),
      );
      return el?.hasAttribute('open') ?? false;
    },
    undefined,
    { timeout: 5_000 },
  );
}
