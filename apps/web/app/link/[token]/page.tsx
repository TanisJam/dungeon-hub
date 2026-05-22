import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { SignInButton } from '@/app/_components/sign-in-button';
import { SignOutButton } from '@/app/_components/sign-out-button';
import { ConfirmLinkButton } from './_confirm-button';

type TokenStatus = {
  discord_id: string;
  discord_username: string;
  expires_at: string;
};

type Props = { params: Promise<{ token: string }> };

export default async function LinkTokenPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return (
      <Shell title="Link your Discord account">
        <p className="text-zinc-400">Sign in with Discord to confirm this link.</p>
        <div className="mt-6">
          <SignInButton redirectTo={`/link/${token}`} />
        </div>
      </Shell>
    );
  }

  let status: TokenStatus;
  try {
    status = await api.get<TokenStatus>(`/auth/link/status/${token}`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      return <ErrorShell status={err.status} body={err.body} />;
    }
    throw err;
  }

  const sessionDiscordId = session.user.user_metadata?.provider_id as string | undefined;
  const sessionDiscordName =
    (session.user.user_metadata?.full_name as string | undefined) ??
    session.user.email ??
    session.user.id;

  const mismatch = sessionDiscordId && sessionDiscordId !== status.discord_id;

  if (mismatch) {
    return (
      <Shell title="Wrong account">
        <p className="text-zinc-300">
          This link is for <strong className="font-mono">{status.discord_username}</strong>.
        </p>
        <p className="mt-2 text-zinc-400">
          You are signed in as <span className="font-mono">{sessionDiscordName}</span>. Sign out
          and sign back in with the right Discord account to continue.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Confirm link">
      <p className="text-zinc-300">
        Link this account to Discord user{' '}
        <strong className="font-mono">{status.discord_username}</strong>?
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Token expires {new Date(status.expires_at).toLocaleString()}.
      </p>
      <div className="mt-6">
        <ConfirmLinkButton token={token} />
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-6">{children}</div>
      <Link href="/" className="mt-12 inline-block text-xs text-zinc-500 hover:text-zinc-300">
        ← Home
      </Link>
    </main>
  );
}

function ErrorShell({ status, body }: { status: number; body: unknown }) {
  const message =
    typeof body === 'object' && body && 'message' in body
      ? String((body as { message: unknown }).message)
      : `HTTP ${status}`;
  return (
    <Shell title="Link unavailable">
      <p className="text-zinc-300">{message}</p>
      <p className="mt-2 text-xs text-zinc-500">
        Ask the bot for a new link with <code>/link</code> on Discord.
      </p>
    </Shell>
  );
}
