import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { V3_RECENT } from './data';

interface CompendiumRecentsListProps {
  /** Optional callback for opening the Fireball detail sheet. Used inside CompendiumDemoIsland. */
  onOpenFireball?: () => void;
}

/**
 * CompendiumRecentsList — "Más consultado" rows.
 * WCP-RECENTS-05: 4 static rows; only Fireball row is interactive when onOpenFireball is provided.
 */
export function CompendiumRecentsList({ onOpenFireball }: CompendiumRecentsListProps) {
  return (
    <div>
      {V3_RECENT.map((r) => {
        const isFireball = r.id === 'fireball';
        const handleClick = isFireball && onOpenFireball ? onOpenFireball : undefined;

        return (
          <button
            key={r.id}
            type="button"
            className={`compendium-init-row${r.cls ? ` ${r.cls}` : ''}`}
            onClick={handleClick}
            style={{ width: '100%', background: 'none', border: 'none', padding: '10px 0', cursor: isFireball ? 'pointer' : 'default' }}
          >
            <div className="ic">
              <Icon name={r.icon as IconName} size={16} />
            </div>
            <div className="body">
              <div className="ttl">{r.name}</div>
              <div className="sub">{r.sub}</div>
            </div>
            <div className="chev">›</div>
          </button>
        );
      })}
    </div>
  );
}
