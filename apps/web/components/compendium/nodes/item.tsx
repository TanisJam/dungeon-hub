import type { ItemNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Definition-list item: "Name. body". 5etools may pass `entries[]` (multi-paragraph) or `entry` (single). */
export function ItemNodeView({ node }: { node: ItemNode }) {
  return (
    <dl className="space-y-1">
      <dt className="font-semibold text-ink inline">{node.name}.</dt>{' '}
      <dd className="inline text-ink">
        {node.entries
          ? // biome-ignore lint/suspicious/noArrayIndexKey: static compendium content — parsed once per render from the fetched document, never reordered/inserted/removed client-side.
            node.entries.map((child, i) => <EntryNodeRenderer key={i} entry={child} />)
          : node.entry !== undefined
            ? <EntryNodeRenderer entry={node.entry} />
            : null}
      </dd>
    </dl>
  );
}
