import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';
import { SignOutButton } from '@/app/_components/sign-out-button';
import { AppShell } from '@/components/layout/app-shell';
import { IdentityHeader } from '../dashboard/_identity-header';
import { DevModeToggle } from '@/components/codex/dev-mode-toggle';

type Me = {
  id: string;
  username: string;
  role: 'admin' | 'dm' | 'player';
  discordId: string | null;
  discordUsername: string | null;
  // codex-knowledge B-4 gap closure (#1953): server-resolved devMode for the toggle.
  devMode: boolean;
};

/**
 * /settings — the real account screen (navigability-audit fix).
 *
 * Was an orphan page that unconditionally redirect('/dashboard') — nothing
 * linked to it, and it just bounced elsewhere. Now renders the account
 * content that used to live only inside /dashboard: IdentityHeader
 * (including SignOutButton) and the "Preferencias" section (DevModeToggle).
 * Both are reused as-is from their existing homes, not forked.
 *
 * Deliberately does NOT include the characters/campaigns sections — those
 * already have proper homes at /personajes and /campanas, and duplicating
 * them here is what made /dashboard a grab-bag in the first place.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  let me: Me;
  try {
    me = await api.get<Me>('/auth/me', token);
  } catch (err) {
    return <FatalError error={err} />;
  }

  const avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture) as
    | string
    | undefined;

  return (
    <AppShell title="Ajustes" subtitle="TU CUENTA">
      <IdentityHeader me={me} avatarUrl={avatarUrl} signOut={<SignOutButton />} />

      <div className="mt-8">
        <section aria-label="Preferencias">
          <h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-mute">
            Preferencias
          </h2>
          <div className="rounded-md border border-line bg-surface-raised px-3 py-2">
            <DevModeToggle currentValue={me.devMode} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function FatalError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? `API ${error.status}: ${error.message}`
      : getErrorMessage(error, String(error));
  return (
    <AppShell title="Ajustes" subtitle="TU CUENTA">
      <div className="py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">No se pudo cargar tu cuenta</h1>
        <p className="mt-3 font-mono text-xs text-ink-mute">{message}</p>
      </div>
    </AppShell>
  );
}
