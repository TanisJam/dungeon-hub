import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { formatSessionsCount, formatNextSession } from './format';
import type { CampaignSummary } from './types';

type Props = {
  campaign: CampaignSummary;
};

export function V3CampCard({ campaign }: Props) {
  const isDm = campaign.memberRole === 'gm';
  const sessionsLabel = formatSessionsCount(campaign.sessionsCount);
  const nextSessionLabel = formatNextSession(campaign.nextSession);

  const rootClass = ['campanas-camp-card', 'block rounded-md p-4', isDm ? 'campanas-camp-card-dm' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <Link href={`/campanas/${campaign.id}`} className={rootClass}>
      {/* Role pill — NORM: 9px→10px font size (atom sm); uppercase+tracking preserved via className */}
      <Pill
        tone={isDm ? 'secondary' : 'primary'}
        fill="tint"
        size="sm"
        className="absolute top-3 right-3 uppercase tracking-widest"
      >
        {isDm ? 'Dirigís' : 'Jugás'}
      </Pill>
      <div className="font-display text-[17px] font-bold leading-tight tracking-tight text-ink">
        {campaign.name}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Pill size="sm">{campaign.playersCount} jugadores</Pill>
        {sessionsLabel ? (
          <Pill size="sm" tone="primary">
            {sessionsLabel}
          </Pill>
        ) : null}
        {nextSessionLabel ? <Pill size="sm">{nextSessionLabel}</Pill> : null}
        {isDm && campaign.pendingFichas !== null ? (
          <Pill size="sm" tone="accent">
            {campaign.pendingFichas} fichas pend.
          </Pill>
        ) : null}
      </div>
    </Link>
  );
}
