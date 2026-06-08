import type { Page } from '@playwright/test';

/**
 * Resolve the Supabase access token from the @supabase/ssr auth cookie.
 *
 * @supabase/ssr stores the session in the `sb-<ref>-auth-token` cookie (value is
 * `base64-<base64(JSON)>`, optionally chunked into `.0`/`.1`), NOT in localStorage.
 * The old localStorage lookup never matched, so auth specs silently skipped.
 */
export async function resolveAccessToken(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies();
  const authCookies = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (authCookies.length === 0) return null;

  let raw = authCookies.map((c) => c.value).join('');
  if (raw.startsWith('base64-')) {
    raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8');
  }
  try {
    const session = JSON.parse(raw) as { access_token?: string };
    return session.access_token ?? null;
  } catch {
    return null;
  }
}
