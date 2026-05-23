import type { QuoteNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Block quote — typically italicised; attribution via `by` or `from`. */
export function QuoteNodeView({ node }: { node: QuoteNode }) {
  const attribution = node.by || node.from;
  return (
    <blockquote className="border-l-4 border-secondary pl-4 italic text-ink-soft space-y-2">
      {node.entries.map((child, i) => (
        <EntryNodeRenderer key={i} entry={child} />
      ))}
      {attribution ? (
        <footer className="not-italic text-sm text-ink-mute">
          — <cite>{attribution}</cite>
        </footer>
      ) : null}
    </blockquote>
  );
}
