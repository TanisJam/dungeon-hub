import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { Card } from '@/components/ui';
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
      <Shell title="Vinculá tu cuenta de Discord">
        <p className="text-ink-soft">Iniciá sesión con Discord para confirmar este vínculo.</p>
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
      <Shell title="Cuenta incorrecta">
        <p className="text-ink-soft">
          Este vínculo es para <strong className="font-mono">{status.discord_username}</strong>.
        </p>
        <p className="mt-2 text-sm text-ink-mute">
          Estás conectado como <span className="font-mono">{sessionDiscordName}</span>. Cerrá sesión
          e ingresá con la cuenta de Discord correcta para continuar.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Confirmar vínculo">
      <p className="text-ink-soft">
        ¿Vincular esta cuenta al usuario de Discord{' '}
        <strong className="font-mono">{status.discord_username}</strong>?
      </p>
      <p className="mt-1 text-xs text-ink-mute">
        El token vence el {new Date(status.expires_at).toLocaleString()}.
      </p>
      <div className="mt-6">
        <ConfirmLinkButton token={token} />
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <Card variant="surface" className="p-6">
        <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
        <div className="mt-4">{children}</div>
      </Card>
      <Link href="/" className="mt-6 inline-block text-xs text-ink-mute hover:text-ink transition-colors">
        ← Inicio
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
    <Shell title="Vínculo no disponible">
      <p className="text-ink-soft">{message}</p>
      <p className="mt-2 text-xs text-ink-mute">
        Pedile al bot un vínculo nuevo con <code>/link</code> en Discord.
      </p>
    </Shell>
  );
}
