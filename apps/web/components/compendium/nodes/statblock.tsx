import type { StatblockNode, StatblockInlineNode } from '../types';
import { slugify } from '../slugify';

/**
 * v1: render as a link-styled span carrying data-compendium-ref. No recursive
 * fetch / mini-block layout — that's a future SDD targeted at spell-card and
 * monster-card use cases.
 */
export function StatblockNodeView({ node }: { node: StatblockNode }) {
  const kind = node.tag || 'creature';
  return (
    <a
      data-compendium-ref={`${kind}|${slugify(node.name)}|${node.source}`}
      className="italic text-ink-soft underline cursor-help"
    >
      {node.name}
    </a>
  );
}

/** Inline mini stat block. v1 same as statblock: link-only when name/source present. */
export function StatblockInlineNodeView({ node }: { node: StatblockInlineNode }) {
  if (!node.name || !node.source) {
    return <span className="text-ink-soft italic">(inline stat block)</span>;
  }
  const kind = node.tag || 'creature';
  return (
    <a
      data-compendium-ref={`${kind}|${slugify(node.name)}|${node.source}`}
      className="italic text-ink-soft underline cursor-help"
    >
      {node.name}
    </a>
  );
}
