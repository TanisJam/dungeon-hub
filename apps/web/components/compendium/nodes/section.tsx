import type { SectionNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Top-level labeled section — heavier visual weight than entries (h3 vs h4). */
export function SectionNodeView({ node }: { node: SectionNode }) {
  return (
    <section className="space-y-2">
      {node.name ? (
        <h3 className="font-display text-ink text-lg font-semibold border-b border-line pb-1">
          {node.name}
        </h3>
      ) : null}
      {node.entries.map((child, i) => (
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </section>
  );
}
