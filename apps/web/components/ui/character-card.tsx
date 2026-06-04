// CharacterCard — card-strip atom unifying personaje-card and active-character-card.
// REQ-C3: struct flex overflow-hidden rounded-md border bg-surface wrapper +
//         <Link> (portrait + content slot + chevron) + optional action slot.
//
// Visual variants are controlled by the caller via className:
//   plain (personaje-card default)    → className="border-line"
//   active highlight (personaje-card) → className="personajes-char-card-active"
//   accent ring (active-char-card)    → className="border-accent ring-1 ring-accent/30 hover:border-accent"
//
// The atom owns structure only; callers own semantics.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CharacterPortrait } from './character-portrait';

export interface CharacterCardProps {
  /** Navigation target of the card. */
  href: string;
  /** Character display name — forwarded to CharacterPortrait for initial derivation. */
  name: string;
  /** Extra classes for the <CharacterPortrait> (e.g. "border-r border-line"). */
  portraitClassName?: string;
  /**
   * Extra classes applied to the root wrapper div.
   * Controls the border / ring treatment.
   * Defaults to "border-line" when not provided.
   */
  className?: string;
  /**
   * Content column slot (name, lineage, pills etc.).
   * Rendered inside the <Link>, between the portrait and the chevron.
   */
  children: ReactNode;
  /**
   * Optional action element rendered OUTSIDE the <Link> (to the right).
   * Used by personaje-card for SetActiveCharacterButton.
   */
  action?: ReactNode;
}

/**
 * CharacterCard — unified card-strip atom for character list/detail cards.
 *
 * Structure:
 *   <div wrapper>
 *     <Link flex-1>
 *       <CharacterPortrait />
 *       <div content-column>{children}</div>
 *       <div aria-hidden>›</div>
 *     </Link>
 *     {action}
 *   </div>
 *
 * Adopted by:
 *   personaje-card.tsx   — content: name + lineage + pills, action: SetActiveCharacterButton
 *   active-character-card.tsx — content: name + lineage + stat pills, no action
 */
export function CharacterCard({
  href,
  name,
  portraitClassName,
  className,
  children,
  action,
}: CharacterCardProps) {
  const wrapperClass = [
    'flex overflow-hidden rounded-md border bg-surface',
    className ?? 'border-line',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClass} data-character-card>
      <Link
        href={href}
        className="flex flex-1 transition-colors hover:border-ink-mute"
      >
        <CharacterPortrait name={name} className={portraitClassName} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
          {children}
        </div>
        <div
          aria-hidden="true"
          className="self-center pr-3 text-xl leading-none text-ink-mute"
        >
          ›
        </div>
      </Link>
      {action}
    </div>
  );
}
