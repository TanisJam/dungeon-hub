import type { Entry, EntryNode } from './types';
import { StringNode } from './nodes/string';
import { UnknownNodeView } from './nodes/unknown';
import { NODE_REGISTRY } from './nodes/registry';

/**
 * Top-level renderer for a 5etools `entries` array.
 *
 * Server component. Walks each entry and dispatches by type. Strings flow
 * through StringNode (which handles inline `{@tag}` parsing). Object entries
 * with a known `type` go through NODE_REGISTRY. Anything else falls back to
 * UnknownNodeView so the renderer never throws on malformed input.
 */
export function CompendiumEntries({ entries }: { entries: Entry[] | null | undefined }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <EntryNodeRenderer key={i} entry={entry} />
      ))}
    </div>
  );
}

/**
 * Per-entry dispatcher. Exported for use by node components that need to
 * recurse (entries, list, item, table cells, ...).
 */
export function EntryNodeRenderer({ entry }: { entry: Entry }) {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'string') return <StringNode text={entry} />;
  if (typeof entry !== 'object') return null;
  // Arrays inside entries[] are rare but appear (e.g. nested list bodies that
  // are themselves multi-paragraph). Treat them as implicit groups.
  if (Array.isArray(entry)) {
    return (
      <>
        {entry.map((child, i) => (
          <EntryNodeRenderer key={i} entry={child} />
        ))}
      </>
    );
  }

  const type = (entry as { type?: string }).type;
  const Handler = type ? NODE_REGISTRY[type] : undefined;
  if (Handler) return <Handler node={entry as EntryNode} />;
  return <UnknownNodeView node={entry as Parameters<typeof UnknownNodeView>[0]['node']} />;
}

export type { Entry, EntryNode } from './types';
