type Me = {
  username: string;
  role: 'admin' | 'dm' | 'player' | string;
  discordUsername: string | null;
};

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-red-500/15 text-red-300 ring-red-500/30',
  dm: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  player: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
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
  const roleClass = ROLE_STYLES[me.role] ?? ROLE_STYLES.player;

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-14 w-14 rounded-full ring-1 ring-zinc-700"
          />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-full bg-zinc-800 text-zinc-400">
            {me.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{me.username}</h1>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${roleClass}`}
            >
              {me.role}
            </span>
          </div>
          {me.discordUsername && (
            <p className="text-xs text-zinc-500">@{me.discordUsername} · Discord</p>
          )}
        </div>
      </div>
      {signOut}
    </header>
  );
}
