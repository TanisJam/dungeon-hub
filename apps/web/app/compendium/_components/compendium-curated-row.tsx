import { Icon } from '@/components/ui';

interface CompendiumCuratedRowProps {
  /** Active campaign name from the API, or null if no active campaign. */
  campaignName: string | null;
}

/**
 * CompendiumCuratedRow — shows the active campaign name in the "Tu campaña" section.
 * WCP-CAMPAIGN-04: real campaign name threaded from page.tsx via CompendiumScreen.
 * Renders an honest empty state when no campaign is active.
 */
export function CompendiumCuratedRow({ campaignName }: CompendiumCuratedRowProps) {
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

  return (
    <div className="compendium-init-row">
      <div className="ic" style={{ color: 'var(--color-primary)', borderColor: 'rgba(91,179,201,0.40)' }}>
        <Icon name="scroll" size={16} />
      </div>
      <div className="body">
        <div className="ttl">{campaignName}</div>
      </div>
      <div className="chev">›</div>
    </div>
  );
}
