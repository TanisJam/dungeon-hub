import { expect, type Locator } from '@playwright/test';

/**
 * Click `trigger` until `revealed` is visible.
 *
 * A server-rendered control is visible and clickable well before React attaches
 * its handler. A single click can therefore land on markup with no `onClick` and
 * do nothing at all — and under `next dev`, where hydration is slow, that window
 * is wide. The symptom is a test that fails on a `toBeVisible` a few seconds in,
 * passes on retry, and looks like a component bug.
 *
 * This is a platform race, not a defect, so the guard belongs on the click and
 * not in the component. The assertion is unchanged: `revealed` must still appear,
 * and a control that never opens still fails — it just no longer fails because
 * the first click outran hydration.
 *
 * NOT for a control that toggles. Re-clicking a toggle closes what the previous
 * click opened, so the loop oscillates and never settles: pointed at the
 * WorldSwitcher trigger it burned the full 20s without ever showing the sheet,
 * where a single click on a fresh page load opens it in under three seconds. Use
 * this only where the trigger opens and does not close — a list row opening a
 * detail sheet, not a switcher.
 *
 * Site-by-site inline guards were the previous approach and they do not hold:
 * mercado's scenario (d) was guarded while its own scenario (e) was not, and (e)
 * kept failing all three attempts with the same locator on the same list. 82e46b6
 * made the same point about the wizard steps — with the same latent race at
 * several sites, fixing one only moves the failure.
 */
export async function clickUntilVisible(
  trigger: Locator,
  revealed: Locator,
  message = 'target must appear after clicking the trigger',
): Promise<void> {
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await trigger.click();
    await expect(revealed, message).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}
