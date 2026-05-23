import type { OptionsNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** "Choose N of:" container — flagged by the optional `count` field. */
export function OptionsNodeView({ node }: { node: OptionsNode }) {
  return (
    <div className="space-y-2">
      {typeof node.count === 'number' ? (
        <p className="text-ink-soft italic">
          Choose {node.count} of the following:
        </p>
      ) : null}
      {node.entries.map((child, i) => (
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </div>
  );
}
