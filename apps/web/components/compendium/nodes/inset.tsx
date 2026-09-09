import type { InsetNode, InsetReadaloudNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Sidebar callout — neutral surface. */
export function InsetNodeView({ node }: { node: InsetNode }) {
  return (
    <aside className="bg-paper-soft border border-line rounded-md p-4 space-y-2">
      {node.name ? (
        <h4 className="font-display text-ink font-semibold">{node.name}</h4>
      ) : null}
      {node.entries.map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static compendium content — parsed once per render from the fetched document, never reordered/inserted/removed client-side.
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </aside>
  );
}

/** "Read-aloud" callout — typically italicised, primary-tinted surface. */
export function InsetReadaloudNodeView({ node }: { node: InsetReadaloudNode }) {
  return (
    <aside className="bg-primary-soft border border-line rounded-md p-4 italic space-y-2">
      {node.name ? (
        <h4 className="font-display text-ink font-semibold not-italic">{node.name}</h4>
      ) : null}
      {node.entries.map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static compendium content — parsed once per render from the fetched document, never reordered/inserted/removed client-side.
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </aside>
  );
}
