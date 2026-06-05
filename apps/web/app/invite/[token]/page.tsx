import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { Card } from '@/components/ui';
import { SignInButton } from '@/app/_components/sign-in-button';
import { ConfirmInviteButton } from './_confirm-button';

type InviteStatus = {
  campaignName: string;
  worldName: string;
  campaignId: string;
  alreadyMember: boolean;
};

type Props = { params: Promise<{ token: string }> };

export default async function InviteTokenPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return (
      <Shell title="Unirte a la campaña">
        <p className="text-ink-soft">Iniciá sesión para aceptar esta invitación.</p>
        <div className="mt-6">
          <SignInButton redirectTo={`/invite/${token}`} />
        </div>
      </Shell>
    );
  }

  let status: InviteStatus;
  try {
    status = await api.get<InviteStatus>(`/invites/status/${token}`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      return <ErrorShell status={err.status} body={err.body} />;
    }
    throw err;
  }

  if (status.alreadyMember) {
    return (
      <Shell title="Ya sos parte de esta campaña">
        <p className="text-ink-soft">
          Ya sos miembro de <strong>{status.campaignName}</strong> ({status.worldName}).
        </p>
        <div className="mt-6">
          <Link
            href={`/campanas/${status.campaignId}`}
            className="inline-flex items-center justify-center w-full min-h-[44px] rounded-[12px] border bg-gradient-to-br from-primary to-primary-deep px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(111,134,201,0.35),0_1px_2px_rgba(39,30,51,0.08)] transition-all hover:brightness-105 border-transparent"
          >
            Ir a la campaña
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Te invitaron a una campaña">
      <p className="text-ink-soft">
        <strong>{status.campaignName}</strong>
      </p>
      <p className="mt-1 text-xs text-ink-mute">{status.worldName}</p>
      <div className="mt-6">
        <ConfirmInviteButton token={token} />
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
      <Link
        href="/"
        className="mt-6 inline-block text-xs text-ink-mute hover:text-ink transition-colors"
      >
        ← Inicio
      </Link>
    </main>
  );
}

function ErrorShell({ status, body }: { status: number; body: unknown }) {
  const isGone = status === 410;
  const errorCode =
    typeof body === 'object' && body && 'error' in body
      ? String((body as { error: unknown }).error)
      : null;

  const message = isGone
    ? errorCode === 'EXPIRED'
      ? 'Este enlace de invitación ya venció.'
      : 'Este enlace de invitación ya no está disponible (fue usado o revocado).'
    : 'Este enlace de invitación no está disponible.';

  return (
    <Shell title="Invitación no disponible">
      <p className="text-ink-soft">{message}</p>
      <p className="mt-2 text-xs text-ink-mute">
        Pedile al DM un nuevo enlace de invitación.
      </p>
    </Shell>
  );
}
