import { Icon, type IconName } from './icon';

interface V3EmptyProps {
  glyph: IconName;
  title: string;
  sub?: string;
}

/**
 * V3Empty — centered empty-state placeholder.
 * Server component. Used by v3 placeholder routes to show "Próximamente" states.
 */
export function V3Empty({ glyph, title, sub }: V3EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-ink-mute">
      <Icon name={glyph} size={40} strokeWidth={1.25} />
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {sub && <p className="font-sans text-sm">{sub}</p>}
    </div>
  );
}
