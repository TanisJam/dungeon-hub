import type { ReactNode } from 'react';
import Link from 'next/link';

// Base classes shared by all variants
const BASE_CLASSES =
  'flex items-center justify-center gap-2 rounded-md border border-dashed border-line font-sans text-[13px] font-semibold text-ink-mute transition-colors';

// Enabled state: hover effects
const ENABLED_CLASSES = 'hover:border-accent hover:text-accent';

// Disabled state: no hover, cursor + opacity treatment
const DISABLED_CLASSES = 'cursor-not-allowed opacity-70';

// Default padding (callers may override via className)
const DEFAULT_PADDING = 'p-4';

interface DashedCTABaseProps {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  /** HTML title attribute (tooltip). */
  title?: string;
}

// Button variant (default)
interface DashedCTAButtonProps extends DashedCTABaseProps {
  href?: undefined;
  onClick?: () => void;
}

// Link variant (when href is provided)
interface DashedCTALinkProps extends DashedCTABaseProps {
  href: string;
  onClick?: () => void;
}

export type DashedCTAProps = DashedCTAButtonProps | DashedCTALinkProps;

/**
 * DashedCTA — polymorphic "add new" dashed-border call-to-action atom.
 *
 * Renders as <button> by default, or as a Next.js <Link> when `href` is provided.
 *
 * Default padding is `p-4`. Pass `className` to override (e.g. `px-4 py-3`).
 * The `disabled` prop applies the no-hover + opacity treatment; for buttons it
 * also sets the native `disabled` attribute.
 */
export function DashedCTA({ children, disabled = false, className, href, onClick, title }: DashedCTAProps) {
  const stateClasses = disabled ? DISABLED_CLASSES : ENABLED_CLASSES;
  const classes = `${BASE_CLASSES} ${DEFAULT_PADDING} ${stateClasses}${className ? ` ${className}` : ''}`;

  if (href !== undefined) {
    return (
      <Link href={href} className={classes} onClick={onClick} title={title}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      className={classes}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
