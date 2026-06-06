import { SectionHead } from '@/components/ui/section-head';
import { DashedCTA } from '@/components/ui/dashed-cta';
import { V3CampCard } from './camp-card';
import type { CampaignSummary } from './types';

type Props = {
  role: string;
  campaigns: CampaignSummary[];
};

export function CampanasView({ role, campaigns }: Props) {
  const playerActive = campaigns.filter((c) => c.memberRole === 'player' && c.status !== 'archived');
  const playerArchived = campaigns.filter((c) => c.memberRole === 'player' && c.status === 'archived');
  const dmActive = campaigns.filter((c) => c.memberRole === 'gm' && c.status !== 'archived');
  const dmArchived = campaigns.filter((c) => c.memberRole === 'gm' && c.status === 'archived');

  // All archived across both roles (for the unified Archivadas section)
  const archived = [...dmArchived, ...playerArchived];

  if (role === 'dm') {
    return (
      <div className="flex flex-col gap-4">
        <SectionHead title="Tus campañas como DM" meta={dmActive.length} />
        <div className="flex flex-col gap-3">
          {dmActive.map((c) => (
            <V3CampCard key={c.id} campaign={c} />
          ))}
        </div>
        <DashedCTA href="/campanas/new">
          <span className="text-lg text-accent">+</span>
          <span>Iniciar campaña nueva</span>
        </DashedCTA>
        {archived.length > 0 ? (
          <section className="mt-2">
            <SectionHead title="Archivadas" meta={archived.length} />
            <div className="mt-3 flex flex-col gap-3">
              {archived.map((c) => (
                <V3CampCard key={c.id} campaign={c} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHead title="Donde jugás" meta={`${playerActive.length} activas`} />
        <div className="mt-3 flex flex-col gap-3">
          {playerActive.map((c) => (
            <V3CampCard key={c.id} campaign={c} />
          ))}
        </div>
      </section>
      {dmActive.length > 0 ? (
        <section>
          <SectionHead title="Donde dirigís" meta={dmActive.length} />
          <div className="mt-3 flex flex-col gap-3">
            {dmActive.map((c) => (
              <V3CampCard key={c.id} campaign={c} />
            ))}
          </div>
        </section>
      ) : null}
      {archived.length > 0 ? (
        <section>
          <SectionHead title="Archivadas" meta={archived.length} />
          <div className="mt-3 flex flex-col gap-3">
            {archived.map((c) => (
              <V3CampCard key={c.id} campaign={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
