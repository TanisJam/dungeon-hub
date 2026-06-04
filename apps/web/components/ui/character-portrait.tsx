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
   */
  size?: 'sm' | 'md';
  /** Extra Tailwind classes for layout concerns (e.g. border-r, shrink-0). */
  className?: string;
}

/**
 * CharacterPortrait — atom for the recurring "initial on a tinted/gradient block" portrait.
 *
 * Covers:
 *   size='md' → personaje-card + active-character-card (72px, gold-tinted dark purple).
 *   size='sm' → pendientes-ficha-card (48px round, magenta radial).
 *
 * The atom never hardcodes hex gradient values — visual styles live in CSS classes
 * (personajes-portrait, pendientes-portrait) defined in globals.css.
 *
 * NOT used for:
 *   pending-fichas-card avatar stack (different concept → AvatarStack).
 *   sheet-hero portrait ring (structurally distinct conic-ring wrapper).
 */
export function CharacterPortrait({
  name,
  size = 'md',
  className,
}: CharacterPortraitProps) {
  const initial = characterInitials(name);

  const baseClasses =
    size === 'md'
      ? 'personajes-portrait grid w-[72px] shrink-0 place-items-center font-display text-[26px] font-bold text-accent'
      : 'pendientes-portrait text-lg font-display font-bold text-white';

  const rootClass = [baseClasses, className].filter(Boolean).join(' ');

  return (
    <div className={rootClass} data-portrait-size={size}>
      {initial}
    </div>
  );
}
