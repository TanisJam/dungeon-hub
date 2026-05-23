import type { TableNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Table with optional caption + col labels. Cells are arbitrary Entry values. */
export function TableNodeView({ node }: { node: TableNode }) {
  const labels = node.colLabels ?? [];
  return (
    <figure className="my-2">
      {node.caption ? (
        <figcaption className="font-display text-ink font-semibold mb-1">{node.caption}</figcaption>
      ) : null}
      <table className="w-full border-collapse text-sm text-ink">
        {labels.length > 0 ? (
          <thead>
            <tr className="border-b border-line">
              {labels.map((label, i) => (
                <th key={i} className="px-2 py-1 text-left font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {node.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-line-soft last:border-b-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 align-top">
                  <EntryNodeRenderer entry={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
