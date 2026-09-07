import Link from 'next/link';
import { Icon } from '@/components/ui';

interface CompendiumCuratedRowProps {
  /** Active campaign name from the API, or null if no active campaign. */
  campaignName: string | null;
  /** Active campaign id — when present, the row links to the campaign page. */
  campaignId?: string | null;
}

/**
 * CompendiumCuratedRow — shows the active campaign name in the "Tu campaña" section.
 * WCP-CAMPAIGN-04: real campaign name threaded from page.tsx via CompendiumScreen.
 * When a campaignId is available, the row is a link to the campaign; otherwise it
 * renders an honest empty/static state.
 */
export function CompendiumCuratedRow({ campaignName, campaignId }: CompendiumCuratedRowProps) {
  if (!campaignName) {
    return (
      <div className="compendium-init-row" style={{ opacity: 0.5 }}>
        <div className="ic" style={{ borderColor: 'var(--color-line)' }}>
          <Icon name="scroll" size={16} />
        </div>
        <div className="body">
          <div className="ttl">Sin campaña activa</div>
        </div>
      </div>
    );
  }

  const inner = (
    <>
      <div className="ic" style={{ color: 'var(--color-primary)', borderColor: 'rgba(91,179,201,0.40)' }}>
        <Icon name="scroll" size={16} />
      </div>
      <div className="body">
        <div className="ttl">{campaignName}</div>
      </div>
      <div className="chev">›</div>
    </>
  );

  if (campaignId) {
    return (
      <Link href={`/campanas/${campaignId}`} className="compendium-init-row">
        {inner}
      </Link>
    );
  }

  return <div className="compendium-init-row">{inner}</div>;
}
