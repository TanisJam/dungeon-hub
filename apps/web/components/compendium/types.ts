/**
 * AST types for 5etools `entries` JSON.
 *
 * Sources stored in `data` jsonb of each compendium row. The renderer walks
 * `Entry[]` and dispatches on the discriminator `type` field. Unknown node
 * shapes fall through to UnknownNode rather than throwing.
 *
 * Reference: https://wiki.tercessuinotlim.com/index.php/5etools_Markup_Language
 */

export type Entry = string | EntryNode;

export type EntryNode =
  | EntriesNode
  | SectionNode
  | ListNode
  | ItemNode
  | TableNode
  | TableGroupNode
  | RowNode
  | InsetNode
  | InsetReadaloudNode
  | ImageNode
  | GalleryNode
  | QuoteNode
  | StatblockNode
  | StatblockInlineNode
  | RefClassFeatureNode
  | RefSubclassFeatureNode
  | RefOptionalFeatureNode
  | RefFeatNode
  | OptionsNode
  | IngredientNode
  | AbilityDcNode
  | AbilityAttackModNode
  | AbilityGenericNode
  | FlowchartNode
  | SpellcastingNode
  | HrNode
  | AttackNode
  | VariantNode
  | VariantInnerNode
  | VariantSubNode
  | InlineBlockNode
  | InlineNode
  | ItemSubNode
  | ItemSpellNode
  | LinkNode
  | BonusNode
  | BonusSpeedNode
  | DiceNode
  | UnknownNode;

export interface EntriesNode {
  type: 'entries';
  name?: string;
  entries: Entry[];
}

export interface SectionNode {
  type: 'section';
  name?: string;
  entries: Entry[];
}

export interface ListNode {
  type: 'list';
  style?: string;
  items: Entry[];
}

export interface ItemNode {
  type: 'item';
  name: string;
  entries?: Entry[];
  entry?: Entry;
}

export interface TableNode {
  type: 'table';
  caption?: string;
  colLabels?: string[];
  colStyles?: string[];
  rows: Entry[][];
}

export interface TableGroupNode {
  type: 'tableGroup';
  tables?: TableNode[];
  name?: string;
}

export interface RowNode {
  type: 'row';
  style?: string;
  row: Entry[];
}

export interface InsetNode {
  type: 'inset';
  name?: string;
  entries: Entry[];
}

export interface InsetReadaloudNode {
  type: 'insetReadaloud';
  name?: string;
  entries: Entry[];
}

export type ImageHref =
  | { type: 'internal'; path: string }
  | { type: 'external'; url: string };

export interface ImageNode {
  type: 'image';
  href: ImageHref;
  title?: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface GalleryNode {
  type: 'gallery';
  images: ImageNode[];
}

export interface QuoteNode {
  type: 'quote';
  entries: Entry[];
  by?: string;
  from?: string;
}

/** Reference to a creature/NPC stat block. v1: link-only, no inline expansion. */
export interface StatblockNode {
  type: 'statblock';
  tag?: string; // "creature" | "object" | "hazard" | etc.
  name: string;
  source: string;
  prop?: string;
  preserveOriginalName?: boolean;
}

/** Literal inline mini stat block (rare). v1: link-only when possible. */
export interface StatblockInlineNode {
  type: 'statblockInline';
  data?: unknown;
  name?: string;
  tag?: string;
  source?: string;
}

export interface RefClassFeatureNode {
  type: 'refClassFeature';
  classFeature: string; // "Action Surge|Fighter|PHB|2"
}

export interface RefSubclassFeatureNode {
  type: 'refSubclassFeature';
  subclassFeature: string; // "name|class|classSrc|subclass|subclassSrc|level|src"
}

export interface RefOptionalFeatureNode {
  type: 'refOptionalfeature';
  optionalfeature: string; // "name|source"
}

export interface RefFeatNode {
  type: 'refFeat';
  feat: string; // "name|source"
}

export interface OptionsNode {
  type: 'options';
  count?: number;
  entries: Entry[];
}

export interface IngredientNode {
  type: 'ingredient';
  entry?: Entry;
  amount?: number;
  amountSecondary?: number;
}

export interface AbilityDcNode {
  type: 'abilityDc';
  name: string;
  attributes: string[];
}

export interface AbilityAttackModNode {
  type: 'abilityAttackMod';
  name: string;
  attributes: string[];
}

export interface AbilityGenericNode {
  type: 'abilityGeneric';
  name?: string;
  text: string;
  attributes?: string[];
}

export interface FlowchartNode {
  type: 'flowchart';
  blocks?: Entry[];
}

export interface SpellcastingNode {
  type: 'spellcasting';
  name: string;
  headerEntries?: Entry[];
  will?: string[];
  daily?: Record<string, string[]>;
  spells?: Record<string, { spells: string[]; slots?: number; lower?: number }>;
  footerEntries?: Entry[];
  ability?: string;
}

export interface HrNode {
  type: 'hr';
}

export interface AttackNode {
  type: 'attack';
  attackType?: string;
  attackEntries?: Entry[];
  hitEntries?: Entry[];
}

export interface VariantNode {
  type: 'variant';
  name?: string;
  entries: Entry[];
}

export interface VariantInnerNode {
  type: 'variantInner';
  name?: string;
  entries: Entry[];
}

export interface VariantSubNode {
  type: 'variantSub';
  name?: string;
  entries: Entry[];
}

export interface InlineBlockNode {
  type: 'inlineBlock';
  entries: Entry[];
}

export interface InlineNode {
  type: 'inline';
  entries: Entry[];
}

export interface ItemSubNode {
  type: 'itemSub';
  name?: string;
  entries?: Entry[];
  entry?: Entry;
}

export interface ItemSpellNode {
  type: 'itemSpell';
  name?: string;
  entries?: Entry[];
  entry?: Entry;
}

export interface LinkNode {
  type: 'link';
  text: string;
  href: { type: 'external' | 'internal'; url?: string; path?: string };
}

export interface BonusNode {
  type: 'bonus';
  value: number;
}

export interface BonusSpeedNode {
  type: 'bonusSpeed';
  value: number;
}

export interface DiceNode {
  type: 'dice';
  toRoll?: Array<{ number: number; faces: number }>;
}

/** Catch-all for unrecognised or missing `type` fields. Renders defensively. */
export interface UnknownNode {
  type?: string;
  name?: string;
  entries?: Entry[];
  // index signature on purpose — we may inspect arbitrary fields in the fallback
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Inline tokens (output of parseInline)
// ---------------------------------------------------------------------------

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'tag'; name: string; args: string };
