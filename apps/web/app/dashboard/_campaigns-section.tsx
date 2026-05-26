import Link from 'next/link';
import { Pill, SectionHead, Card } from '@/components/ui';
import type { PillTone } from '@/components/ui';

type CampaignRow = {
  id: string;
  name: string;
  gmUserId: string;
  worldId: string;
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

  // REQ-DWL-MASTER-CLICKABLE (spec #857) — GM rows wrap the "DM" pill in a
  // Link to /worlds/[id] so the DM can drop into the world session panel.
  // Player rows keep the inert pill (no link target — they reach their own
  // characters via the Characters section).
  const pillNode = (
    <Pill tone={roleTone} size="sm">{roleLabel}</Pill>
  );

  return (
    <li>
      <Card variant="surface" className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-semibold text-ink">{campaign.name}</p>
          {isGm ? (
            <Link
              href={`/worlds/${campaign.worldId}`}
              aria-label={`Abrir panel de maestro de ${campaign.name}`}
              className="inline-flex min-h-[44px] items-center transition-opacity hover:opacity-80"
            >
              {pillNode}
            </Link>
          ) : (
            pillNode
          )}
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
