import type {
  AbilityDcNode,
  AbilityAttackModNode,
  AbilityGenericNode,
} from '../types';

const ABILITY_NAME: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

function formatAttrs(attrs: string[]): string {
  if (attrs.length === 0) return '';
  const names = attrs.map((a) => ABILITY_NAME[a.toLowerCase()] ?? a);
  if (names.length === 1) return names[0]!;
  return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
}

/** "<name> save DC = 8 + your proficiency bonus + your <Ability> modifier" */
export function AbilityDcNodeView({ node }: { node: AbilityDcNode }) {
  return (
    <p className="leading-relaxed text-ink">
      <strong>{node.name} save DC</strong> = 8 + your proficiency bonus + your{' '}
      {formatAttrs(node.attributes)} modifier
    </p>
  );
}

/** "<name> attack modifier = your proficiency bonus + your <Ability> modifier" */
export function AbilityAttackModNodeView({ node }: { node: AbilityAttackModNode }) {
  return (
    <p className="leading-relaxed text-ink">
      <strong>{node.name} attack modifier</strong> = your proficiency bonus + your{' '}
      {formatAttrs(node.attributes)} modifier
    </p>
  );
}

/** Generic ability description block. */
export function AbilityGenericNodeView({ node }: { node: AbilityGenericNode }) {
  return (
    <p className="leading-relaxed text-ink">
      {node.name ? <strong>{node.name}:</strong> : null} {node.text}
    </p>
  );
}
