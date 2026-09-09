import { env } from '@/lib/env';

/**
 * apiSupportsHomebrew — does the DEPLOYED API have the homebrew endpoints?
 *
 * This exists because deployment here is hybrid and asymmetric: `apps/web` ships
 * itself to Vercel on every push to main, while `apps/api` is a manual
 * build-and-swap on the home-lab VM (docs/onboarding/api-deploy.md). Merging a
 * full-stack feature therefore ships the UI and NOT its backend, and the gap
 * lasts until someone runs the swap.
 *
 * This page was merged straight into that gap: the upload form and the export
 * button reached production while POST /worlds/:id/homebrew/items and
 * GET /worlds/:id/export still answered 404. The project had already avoided
 * this once — PR #20 held the character-import UI back rather than "ship a
 * button that 404s" — and it is worth not repeating.
 *
 * The probe: POST an empty `items` array. A deployed route rejects it at Zod
 * with 400 VALIDATION_FAILED (`items` is min(1)); a route that does not exist
 * answers 404. Nothing is written either way, and validation runs before any
 * database work, so it is cheap.
 *
 * Anything else — a network error, a 5xx — counts as "yes". An unknown answer
 * should not make a working feature disappear; the real call will report the
 * real problem, which is more useful than a page that quietly hides itself.
 */
export async function apiSupportsHomebrew(worldId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${env.API_URL}/api/v1/worlds/${worldId}/homebrew/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
      cache: 'no-store',
    });
    return res.status !== 404;
  } catch {
    return true;
  }
}
