import type { HTMLAttributes } from 'react';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * Skeleton — pulsing placeholder block for loading states (audit F1, work unit 2).
 *
 * Visual pattern matches the existing inline loading state in
 * components/compendium/term/TermCard.tsx:59-68 (bg-surface-soft + rounded-sm +
 * animate-pulse) so a new `loading.tsx` reads consistently with the one
 * skeleton this app already shipped.
 *
 * motion-reduce:animate-none is required, not decorative: app/globals.css
 * guards its own keyframes (v3-sheet-slide-up, poi-pulse) behind
 * prefers-reduced-motion media queries, but Tailwind's built-in `animate-pulse`
 * utility is NOT covered by that — it keeps animating for users who asked for
 * reduced motion unless every call site opts out itself.
 *
 * aria-hidden: a skeleton block carries no semantic content of its own. The
 * loading.tsx root that composes several of these is responsible for
 * announcing the loading state once (role="status" + aria-busy="true" +
 * aria-label) instead of a screen reader hitting a wall of empty divs.
 */
export function Skeleton({ className = '', ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse motion-reduce:animate-none rounded-sm bg-surface-soft ${className}`}
      {...rest}
    />
  );
}
