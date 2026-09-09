import { characterInitials } from '@/lib/character-initials';

export interface CharacterPortraitProps {
  /** The character's display name — initials are derived automatically. */
  name: string;
  /**
   * Portrait size family.
   * - 'md' (default): 72px square, accent-gold gradient (personajes-portrait CSS class).
   *   Used in personaje-card and active-character-card card-strip layouts.
   * - 'sm': 48px round, magenta radial (pendientes-portrait CSS class).
   *   Used in pendientes-ficha-card.
   * - 'hero': 80px conic-ring wrapper + inner block, 2-letter initials (ficha-portrait-ring
   *   / ficha-portrait-inner CSS classes). Used in sheet-hero.
   */
  size?: 'sm' | 'md' | 'hero';
  /** Extra Tailwind classes for layout concerns (e.g. border-r, shrink-0). */
  className?: string;
  /** Aria-label for the root element (used by the 'hero' ring variant). */
  ariaLabel?: string;
}

/**
 * CharacterPortrait — atom for the recurring "initial on a tinted/gradient block" portrait.
 *
 * Covers:
 *   size='md'   → personaje-card + active-character-card (72px, gold-tinted dark purple).
 *   size='sm'   → pendientes-ficha-card (48px round, magenta radial).
 *   size='hero' → sheet-hero (80px conic-ring wrapper + inner block, 2-letter initials).
 *
 * The atom never hardcodes hex gradient values — visual styles live in CSS classes
 * (personajes-portrait, pendientes-portrait, ficha-portrait-ring/inner) in globals.css.
 *
 * NOT used for:
 *   pending-fichas-card avatar stack (different concept → AvatarStack).
 */
export function CharacterPortrait({
  name,
  size = 'md',
  className,
  ariaLabel,
}: CharacterPortraitProps) {
  // 'hero' shows two-letter initials; sm/md show a single letter.
  const initial = characterInitials(name, size === 'hero' ? { maxChars: 2 } : undefined);

  // 'hero' is structurally distinct: a conic-ring wrapper around an inner block.
  if (size === 'hero') {
    const rootClass = [
      'ficha-portrait-ring flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-md',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={rootClass}
        data-portrait-size="hero"
        style={{ padding: '2px' }}
        role="img"
        aria-label={ariaLabel}
      >
        <div className="ficha-portrait-inner flex h-full w-full items-center justify-center rounded-sm">
          <span className="font-display text-2xl font-bold text-white">{initial}</span>
        </div>
      </div>
    );
  }

  const baseClasses =
    size === 'md'
      ? 'personajes-portrait grid w-[72px] shrink-0 place-items-center font-display text-[26px] font-bold text-accent'
      : 'pendientes-portrait text-lg font-display font-bold text-white';

  const rootClass = [baseClasses, className].filter(Boolean).join(' ');

  return (
    <div className={rootClass} data-portrait-size={size} role="img" aria-label={ariaLabel}>
      {initial}
    </div>
  );
}
