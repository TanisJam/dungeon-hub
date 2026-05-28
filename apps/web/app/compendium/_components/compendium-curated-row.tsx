import { Icon } from '@/components/ui';

/**
 * CompendiumCuratedRow — static stub for the "Tu campaña" section.
 * WCP-CAMPAIGN-04: shows world name + subtitle; no API call.
 */
export function CompendiumCuratedRow() {
  return (
    <div className="compendium-init-row">
      <div className="ic" style={{ color: 'var(--color-primary)', borderColor: 'rgba(91,179,201,0.40)' }}>
        <Icon name="scroll" size={16} />
      </div>
      <div className="body">
        <div className="ttl">Mundo · Las Tres Lunas</div>
        <div className="sub">14 lugares · 27 NPCs · 9 facciones</div>
      </div>
      <div className="chev">›</div>
    </div>
  );
}
