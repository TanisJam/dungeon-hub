import { SectionHead, V3Empty } from '@/components/ui';
import type { Novedad } from './mock-data';

interface NovedadesFeedProps {
  items: Novedad[];
}

export function NovedadesFeed({ items }: NovedadesFeedProps) {
  return (
    <>
      <SectionHead title="Novedades del gremio" />
      {items.length === 0 ? (
        <V3Empty
          glyph="sparkle"
          title="Sin novedades"
          sub="Cuando algo pase en el gremio aparecerá acá."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.slice(0, 3).map((n) => (
            <article
              key={n.id}
              className="flex gap-3 rounded-sm border border-line-soft bg-surface px-3.5 py-3"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  n.fresh ? 'inicio-feed-dot' : 'bg-ink-mute'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[13px] font-semibold text-ink">{n.ttl}</div>
                <div className="mt-px font-sans text-[11px] text-ink-mute">{n.sub}</div>
              </div>
              <div className="font-sans text-[10px] font-semibold tracking-wider text-ink-mute">
                {n.when}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
