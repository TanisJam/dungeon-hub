import Link from 'next/link';
import { SectionHead } from '@/components/ui/section-head';
import { V3CampCard } from './camp-card';
import type { CampaignSummary } from './types';

type Props = {
  role: string;
  campaigns: CampaignSummary[];
};

export function CampanasView({ role, campaigns }: Props) {
  const player = campaigns.filter((c) => c.memberRole === 'player');
  const dm = campaigns.filter((c) => c.memberRole === 'gm');

  if (role === 'dm') {
    return (
      <div className="flex flex-col gap-4">
        <SectionHead title="Tus campañas como DM" meta={dm.length} />
        <div className="flex flex-col gap-3">
          {dm.map((c) => (
            <V3CampCard key={c.id} campaign={c} />
          ))}
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line p-4 font-sans text-[13px] font-semibold text-ink-mute transition-colors hover:border-accent hover:text-accent"
        >
          <span className="text-lg text-accent">+</span>
          <span>Iniciar campaña nueva</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHead title="Donde jugás" meta={`${player.length} activas`} />
        <div className="mt-3 flex flex-col gap-3">
          {player.map((c) => (
            <V3CampCard key={c.id} campaign={c} />
          ))}
        </div>
      </section>
      {dm.length > 0 ? (
        <section>
          <SectionHead title="Donde dirigís" meta={dm.length} />
          <div className="mt-3 flex flex-col gap-3">
            {dm.map((c) => (
              <V3CampCard key={c.id} campaign={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
