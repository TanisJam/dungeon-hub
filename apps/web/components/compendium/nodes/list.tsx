import type { ListNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Bullet list. 5etools may pass `style` for ordered/numbered variants; for v1 we render <ul>. */
export function ListNodeView({ node }: { node: ListNode }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-ink marker:text-ink-mute">
      {node.items.map((item, i) => (
        <li key={i}>
          <EntryNodeRenderer entry={item} />
        </li>
      ))}
    </ul>
  );
}
