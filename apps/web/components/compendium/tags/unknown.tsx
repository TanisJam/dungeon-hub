import { takeDisplay } from '../inline';

/** Fallback for inline `{@tag}` types not registered yet. Shows display text. */
export function UnknownTag({ args }: { args: string }) {
  return <span>{takeDisplay(args)}</span>;
}
