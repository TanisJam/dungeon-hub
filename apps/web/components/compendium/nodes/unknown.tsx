import type { UnknownNode } from '../types';

/**
 * Defensive fallback for nodes the renderer doesn't recognise (rare/missing
 * type, or new types added by 5etools after this file shipped). Renders the
 * node's `name` if present so we don't silently swallow visible content; if
 * there's nothing recognisable, renders null.
 */
export function UnknownNodeView({ node }: { node: UnknownNode }) {
  if (typeof node.name === 'string' && node.name.length > 0) {
    return <span className="text-ink-soft">{node.name}</span>;
  }
  return null;
}
