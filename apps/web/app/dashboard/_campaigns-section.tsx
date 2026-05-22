import { Pill, SectionHead, Card } from '@/components/ui';
import type { PillTone } from '@/components/ui';

type CampaignRow = {
  id: string;
  name: string;
  gmUserId: string;
  memberRole: 'gm' | 'player' | string;
};

const ROLE_LABELS: Record<string, string> = {
  gm: 'DM',
  player: 'Jugador',
};

const ROLE_TONES: Record<string, PillTone> = {
  gm: 'amber',
  player: 'green',
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
      <div className="flex items-center justify-between mb-4">
        <SectionHead num={campaigns.length || undefined} title="Tus Campañas" />
      </div>

      {campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
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
  const roleTone: PillTone = ROLE_TONES[role] ?? 'stone';
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <li>
      <Card variant="surface" className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-semibold text-ink">{campaign.name}</p>
          <Pill tone={roleTone} size="sm">{roleLabel}</Pill>
        </div>
      </Card>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-8 text-center">
      <p className="text-sm text-ink-mute">Todavía no estás en ninguna campaña.</p>
    </div>
  );
}
