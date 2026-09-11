import Link from 'next/link';
import { Icon, type IconName } from './icon';

interface V3EmptyProps {
  glyph: IconName;
  title: string;
  sub?: string;
  /** Optional CTA. Rendered as a filled button at size="page", as a plain link at size="inline". */
  cta?: { label: string; href: string };
  /**
   * 'page' (default): full-treatment centered empty state for a whole route or tab.
   * 'inline': compact variant for an empty state nested inside a card, a list
   * section, or a sheet — smaller icon, tighter padding, no filled button.
   * Defaults to 'page' so every existing call site renders byte-identically.
   */
  size?: 'page' | 'inline';
}

/**
 * V3Empty — empty-state placeholder, in a page-level and an inline flavor.
 * Server component. Used by v3 placeholder routes to show "Próximamente" states,
 * (codex-rehome) player Codex no-active-character empty state with CTA, and
 * (ui-craft F9) section/card-level empties via size="inline".
 * REQ-EMPTY-01: optional CTA link, ≥44px tap target, mobile-first.
 *
 * Both variants carry `data-v3-empty` so a test can assert "this section is
 * showing its empty state" without pinning the assertion to the copy. Two e2e
 * specs used to match the literal "Sin grants recientes." and both broke the day
 * ui-craft F9 rewrote that empty state and dropped the full stop — a one-character
 * change, green CI, two silently dead guards. With 34 call sites and copy that is
 * meant to keep improving, the copy is the wrong thing to assert on.
 */
export function V3Empty({ glyph, title, sub, cta, size = 'page' }: V3EmptyProps) {
  if (size === 'inline') {
    return (
      <div data-v3-empty="inline" className="flex flex-col items-center gap-1.5 py-4 text-center text-ink-mute">
        <Icon name={glyph} size={20} strokeWidth={1.5} />
        <p className="font-sans text-sm text-ink">{title}</p>
        {sub && <p className="font-sans text-xs">{sub}</p>}
        {cta && (
          <Link
            href={cta.href}
            className="mt-1 flex min-h-[44px] items-center font-sans text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            {cta.label}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div data-v3-empty="page" className="flex flex-col items-center justify-center gap-3 py-16 text-center text-ink-mute">
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
