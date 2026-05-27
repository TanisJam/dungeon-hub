import { Pill, Icon } from '@/components/ui';
import type { NextCampaign } from './mock-data';

interface HeroNextSessionProps {
  campaign: NextCampaign;
}

export function HeroNextSession({ campaign }: HeroNextSessionProps) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-accent p-4 inicio-hero-bg shadow-stamp-lg">
      <div className="text-eyebrow text-accent">Próxima sesión</div>
      <h2 className="mt-1.5 font-display text-[22px] font-bold leading-tight tracking-tight text-ink">
        {campaign.name}
      </h2>
      <p className="mt-1 font-script text-[13px] text-ink-soft">
        {campaign.tagline}
      </p>
      <div className="mt-3.5 flex items-center gap-2.5 border-t border-accent/20 pt-3.5">
        <span className="font-display text-[30px] font-bold leading-none text-accent inicio-stat-glow tabular-nums">
          {campaign.daysToSession}
        </span>
        <div>
          <div className="text-eyebrow text-ink-mute">días</div>
          <div className="text-eyebrow text-ink-soft tracking-wider">{campaign.nextSession}</div>
        </div>
        <span className="flex-1" />
        <Pill tone="green" size="sm">
          <Icon name="dice" size={10} /> Sesión {campaign.sessions + 1}
        </Pill>
      </div>
    </section>
  );
}
