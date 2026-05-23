import type { ItemNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Definition-list item: "Name. body". 5etools may pass `entries[]` (multi-paragraph) or `entry` (single). */
export function ItemNodeView({ node }: { node: ItemNode }) {
  return (
    <dl className="space-y-1">
      <dt className="font-semibold text-ink inline">{node.name}.</dt>{' '}
      <dd className="inline text-ink">
        {node.entries
          ? node.entries.map((child, i) => <EntryNodeRenderer key={i} entry={child} />)
          : node.entry !== undefined
            ? <EntryNodeRenderer entry={node.entry} />
            : null}
      </dd>
    </dl>
  );
}
