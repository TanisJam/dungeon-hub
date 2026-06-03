import Link from 'next/link';
import { Icon, type IconName } from './icon';

interface V3EmptyProps {
  glyph: IconName;
  title: string;
  sub?: string;
  /** Optional CTA rendered as a Link button below the sub text. codex-rehome ADR-5. */
  cta?: { label: string; href: string };
}

/**
 * V3Empty — centered empty-state placeholder.
 * Server component. Used by v3 placeholder routes to show "Próximamente" states
 * and (codex-rehome) player Codex no-active-character empty state with CTA.
 * REQ-EMPTY-01: optional CTA link, ≥44px tap target, mobile-first.
 */
export function V3Empty({ glyph, title, sub, cta }: V3EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-ink-mute">
      <Icon name={glyph} size={40} strokeWidth={1.25} />
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {sub && <p className="font-sans text-sm">{sub}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-2 flex min-h-[44px] items-center rounded-md bg-ink px-6 py-2 font-sans text-sm font-medium text-paper"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
