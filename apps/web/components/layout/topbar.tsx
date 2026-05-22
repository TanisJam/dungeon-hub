import type { ReactNode } from 'react';
import { CrowMark } from '@/components/ui/crow-mark';

interface TopBarProps {
  title?: string;
  sub?: string;
  right?: ReactNode;
}

/**
 * TopBar — sticky app header.
 * Sticky, white-blur backdrop, crow mark + title + optional subtitle + right slot.
 * Server component.
 */
export function TopBar({ title = 'Dungeon Hub', sub, right }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-surface/90 backdrop-blur-md border-b border-line">
      <CrowMark />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="font-display font-bold text-base leading-tight tracking-tight text-ink truncate">
          {title}
        </span>
        {sub && (
          <span className="text-[11px] font-semibold text-ink-mute tracking-wide uppercase">
            {sub}
          </span>
        )}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </header>
  );
}
