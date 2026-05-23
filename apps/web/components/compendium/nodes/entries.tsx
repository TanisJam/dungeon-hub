import type { EntriesNode } from '../types';
import { EntryNodeRenderer } from '../index';

/**
 * Nested labelled section. 5etools uses `entries` blocks heavily for nested
 * feature descriptions (e.g. "Darkvision" inside a race's traits). Renders as
 * <section> with an optional h4 label.
 */
export function EntriesNodeView({ node }: { node: EntriesNode }) {
  return (
    <section className="space-y-2">
      {node.name ? (
        <h4 className="font-display text-ink font-semibold">{node.name}.</h4>
      ) : null}
      {node.entries.map((child, i) => (
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </section>
  );
}
