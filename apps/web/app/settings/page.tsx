import { redirect } from 'next/navigation';

/**
 * /settings index — no dedicated settings screen yet; account preferences live
 * on /dashboard (profile, characters, campaigns, PREFERENCIAS). Redirect there
 * so a /settings deep-link lands somewhere coherent, not back on the home feed.
 */
export default function SettingsIndexPage() {
  redirect('/dashboard');
}
