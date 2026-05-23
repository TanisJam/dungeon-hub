import type {
  HrNode,
  FlowchartNode,
  TableGroupNode,
  AttackNode,
  VariantNode,
  VariantInnerNode,
  VariantSubNode,
  InlineBlockNode,
  InlineNode,
  ItemSubNode,
  ItemSpellNode,
  LinkNode,
  BonusNode,
  BonusSpeedNode,
  DiceNode,
  RowNode,
  SpellcastingNode,
} from '../types';
import { EntryNodeRenderer } from '../index';

export function HrNodeView(_: { node: HrNode }) {
  return <hr className="border-line my-3" />;
}

export function FlowchartNodeView({ node }: { node: FlowchartNode }) {
  return (
    <ol className="list-decimal pl-5 space-y-1 text-ink">
      {(node.blocks ?? []).map((b, i) => (
        <li key={i}>
          <EntryNodeRenderer entry={b} />
        </li>
      ))}
    </ol>
  );
}

export function TableGroupNodeView({ node }: { node: TableGroupNode }) {
  return (
    <div className="space-y-3">
      {node.name ? (
        <h4 className="font-display text-ink font-semibold">{node.name}</h4>
      ) : null}
      {(node.tables ?? []).map((t, i) => (
        <EntryNodeRenderer key={i} entry={t} />
      ))}
    </div>
  );
}

/** Monster/NPC action line — attackType + hit + damage chunks inline. */
export function AttackNodeView({ node }: { node: AttackNode }) {
  return (
    <div className="leading-relaxed text-ink">
      {node.attackEntries
        ? node.attackEntries.map((e, i) => <EntryNodeRenderer key={`a${i}`} entry={e} />)
        : null}
      {node.hitEntries && node.hitEntries.length > 0 ? (
        <>
          {' '}
          <em className="font-semibold">Hit:</em>{' '}
          {node.hitEntries.map((e, i) => <EntryNodeRenderer key={`h${i}`} entry={e} />)}
        </>
      ) : null}
    </div>
  );
}

function VariantBox({
  node,
  level,
}: {
  node: VariantNode | VariantInnerNode | VariantSubNode;
  level: 'h4' | 'h5';
}) {
  const Heading = level;
  return (
    <div className="border-l-2 border-line-soft pl-3 space-y-2">
      {node.name ? (
        <Heading className="font-display text-ink font-semibold">{node.name}</Heading>
      ) : null}
      {node.entries.map((child, i) => (
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </div>
  );
}

export function VariantNodeView({ node }: { node: VariantNode }) {
  return <VariantBox node={node} level="h4" />;
}
export function VariantInnerNodeView({ node }: { node: VariantInnerNode }) {
  return <VariantBox node={node} level="h5" />;
}
export function VariantSubNodeView({ node }: { node: VariantSubNode }) {
  return <VariantBox node={node} level="h5" />;
}

export function InlineBlockNodeView({ node }: { node: InlineBlockNode }) {
  return (
    <span>
      {node.entries.map((child, i) => (
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </span>
  );
}

export function InlineNodeView({ node }: { node: InlineNode }) {
  return (
    <span>
      {node.entries.map((child, i) => (
        <EntryNodeRenderer key={i} entry={child} />
      ))}
    </span>
  );
}

/** Sub-item — same shape as item but rendered slightly indented. */
export function ItemSubNodeView({ node }: { node: ItemSubNode }) {
  return (
    <dl className="pl-3 space-y-1">
      {node.name ? <dt className="font-semibold text-ink inline">{node.name}.</dt> : null}
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

/** Spell-style item — same rendering as itemSub (structurally identical). */
export function ItemSpellNodeView({ node }: { node: ItemSpellNode }) {
  return <ItemSubNodeView node={{ ...node, type: 'itemSub' }} />;
}

export function LinkNodeView({ node }: { node: LinkNode }) {
  const url = node.href.url || node.href.path || '#';
  const external = node.href.type === 'external';
  return (
    <a
      href={url}
      className="text-primary-deep underline"
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {node.text}
    </a>
  );
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export function BonusNodeView({ node }: { node: BonusNode }) {
  return <span className="font-mono">{signed(node.value)}</span>;
}

export function BonusSpeedNodeView({ node }: { node: BonusSpeedNode }) {
  return <span className="font-mono">{signed(node.value)} ft.</span>;
}

export function DiceNodeView({ node }: { node: DiceNode }) {
  const expr = (node.toRoll ?? [])
    .map((r) => `${r.number}d${r.faces}`)
    .join(' + ');
  return <span className="font-mono">{expr || '—'}</span>;
}

/** Row node is mostly used inside tables — render its cells inline. */
export function RowNodeView({ node }: { node: RowNode }) {
  return (
    <>
      {node.row.map((c, i) => (
        <EntryNodeRenderer key={i} entry={c} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Spellcasting — monsters & some classes have an inline block listing spell
// frequency tiers (at-will, daily, by-level). Shape is approximate; renderer
// is forgiving and falls back to listing whatever's present.
// ---------------------------------------------------------------------------

export function SpellcastingNodeView({ node }: { node: SpellcastingNode }) {
  const dailyKeys = node.daily ? Object.keys(node.daily) : [];
  const levelKeys = node.spells ? Object.keys(node.spells) : [];
  return (
    <div className="space-y-2">
      {node.name ? (
        <h4 className="font-display text-ink font-semibold">{node.name}</h4>
      ) : null}
      {(node.headerEntries ?? []).map((e, i) => (
        <EntryNodeRenderer key={`h${i}`} entry={e} />
      ))}
      {node.will && node.will.length > 0 ? (
        <p className="text-ink">
          <em className="font-semibold">At will:</em> {node.will.join(', ')}
        </p>
      ) : null}
      {dailyKeys.map((k) => (
        <p key={`d${k}`} className="text-ink">
          <em className="font-semibold">{k}/day:</em> {(node.daily?.[k] ?? []).join(', ')}
        </p>
      ))}
      {levelKeys.map((lvl) => {
        const slot = node.spells?.[lvl];
        if (!slot) return null;
        const label = slot.slots !== undefined ? `${lvl}: (${slot.slots} slots)` : `Level ${lvl}:`;
        return (
          <p key={`l${lvl}`} className="text-ink">
            <em className="font-semibold">{label}</em> {slot.spells.join(', ')}
          </p>
        );
      })}
      {(node.footerEntries ?? []).map((e, i) => (
        <EntryNodeRenderer key={`f${i}`} entry={e} />
      ))}
    </div>
  );
}
