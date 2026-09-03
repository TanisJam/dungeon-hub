import { redirect } from 'next/navigation';

/**
 * /settings index — redirects to /inicio (no dedicated settings screen yet).
 */
export default function SettingsIndexPage() {
  redirect('/inicio');
}
