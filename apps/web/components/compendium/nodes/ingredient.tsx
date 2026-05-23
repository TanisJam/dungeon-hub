import type { IngredientNode } from '../types';
import { EntryNodeRenderer } from '../index';

/** Recipe ingredient row: "<amount> [secondary] <name>". */
export function IngredientNodeView({ node }: { node: IngredientNode }) {
  return (
    <div className="leading-relaxed text-ink">
      {typeof node.amount === 'number' ? (
        <span className="font-mono mr-1 text-ink-soft">
          {node.amount}
          {typeof node.amountSecondary === 'number' ? `–${node.amountSecondary}` : ''}
        </span>
      ) : null}
      {node.entry !== undefined ? <EntryNodeRenderer entry={node.entry} /> : null}
    </div>
  );
}
