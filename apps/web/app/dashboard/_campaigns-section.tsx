type CampaignRow = {
  id: string;
  name: string;
  gmUserId: string;
  memberRole: 'gm' | 'player' | string;
};

const ROLE_STYLES: Record<string, string> = {
  gm: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  player: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
};

export function CampaignsSection({
  campaigns,
  currentUserId,
}: {
  campaigns: CampaignRow[];
  currentUserId: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
        Your Campaigns
      </h2>

      {campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-4 space-y-2">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} isGm={c.gmUserId === currentUserId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CampaignCard({
  campaign,
  isGm,
}: {
  campaign: CampaignRow;
  isGm: boolean;
}) {
  const role = isGm ? 'gm' : campaign.memberRole;
  const roleClass = ROLE_STYLES[role] ?? ROLE_STYLES.player;
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition hover:border-zinc-700">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-medium">{campaign.name}</p>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${roleClass}`}
        >
          {role}
        </span>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center">
      <p className="text-sm text-zinc-500">You&apos;re not in any campaign yet.</p>
    </div>
  );
}
