import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';

type Me = {
  username: string;
  role: 'admin' | 'dm' | 'player' | string;
  discordUsername: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  dm: 'DM',
  player: 'Jugador',
};

const ROLE_TONES: Record<string, PillTone> = {
  admin: 'coral',
  dm: 'amber',
  player: 'green',
};

export function IdentityHeader({
  me,
  avatarUrl,
  signOut,
}: {
  me: Me;
  avatarUrl?: string;
  signOut: React.ReactNode;
}) {
  const roleTone: PillTone = ROLE_TONES[me.role] ?? 'stone';
  const roleLabel = ROLE_LABELS[me.role] ?? me.role;

  return (
    <header className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-12 w-12 rounded-full ring-2 ring-line"
          />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-surface border border-line text-ink-soft font-display font-bold text-lg">
            {me.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-lg text-ink leading-tight">
              {me.username}
            </span>
            <Pill tone={roleTone} size="sm">{roleLabel}</Pill>
          </div>
          {me.discordUsername && (
            <p className="text-xs text-ink-mute mt-0.5">@{me.discordUsername} · Discord</p>
          )}
        </div>
      </div>
      {signOut}
    </header>
  );
}
