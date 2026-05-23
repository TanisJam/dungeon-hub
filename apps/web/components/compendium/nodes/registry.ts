import type { ComponentType } from 'react';
import type { EntryNode } from '../types';
import { EntriesNodeView } from './entries';
import { ListNodeView } from './list';
import { ItemNodeView } from './item';
import { TableNodeView } from './table';
import { SectionNodeView } from './section';
import { InsetNodeView, InsetReadaloudNodeView } from './inset';
import { ImageNodeView, GalleryNodeView } from './image';
import { QuoteNodeView } from './quote';
import { StatblockNodeView, StatblockInlineNodeView } from './statblock';
import {
  RefClassFeatureNodeView,
  RefSubclassFeatureNodeView,
  RefOptionalFeatureNodeView,
  RefFeatNodeView,
} from './refs';
import { OptionsNodeView } from './options';
import { IngredientNodeView } from './ingredient';
import {
  AbilityDcNodeView,
  AbilityAttackModNodeView,
  AbilityGenericNodeView,
} from './abilities';
import {
  HrNodeView,
  FlowchartNodeView,
  TableGroupNodeView,
  AttackNodeView,
  VariantNodeView,
  VariantInnerNodeView,
  VariantSubNodeView,
  InlineBlockNodeView,
  InlineNodeView,
  ItemSubNodeView,
  ItemSpellNodeView,
  LinkNodeView,
  BonusNodeView,
  BonusSpeedNodeView,
  DiceNodeView,
  RowNodeView,
  SpellcastingNodeView,
} from './misc';

/**
 * Each phase registers more node types here. Order doesn't matter — the
 * dispatcher looks up by node.type.
 */
export const NODE_REGISTRY: Partial<Record<string, ComponentType<{ node: EntryNode }>>> = {
  // Tier 1 — Phase A
  entries: EntriesNodeView as ComponentType<{ node: EntryNode }>,
  list: ListNodeView as ComponentType<{ node: EntryNode }>,
  item: ItemNodeView as ComponentType<{ node: EntryNode }>,
  table: TableNodeView as ComponentType<{ node: EntryNode }>,
  // Tier 2 — Phase B
  section: SectionNodeView as ComponentType<{ node: EntryNode }>,
  inset: InsetNodeView as ComponentType<{ node: EntryNode }>,
  insetReadaloud: InsetReadaloudNodeView as ComponentType<{ node: EntryNode }>,
  image: ImageNodeView as ComponentType<{ node: EntryNode }>,
  gallery: GalleryNodeView as ComponentType<{ node: EntryNode }>,
  quote: QuoteNodeView as ComponentType<{ node: EntryNode }>,
  // Tier 3 — Phase C
  statblock: StatblockNodeView as ComponentType<{ node: EntryNode }>,
  statblockInline: StatblockInlineNodeView as ComponentType<{ node: EntryNode }>,
  refClassFeature: RefClassFeatureNodeView as ComponentType<{ node: EntryNode }>,
  refSubclassFeature: RefSubclassFeatureNodeView as ComponentType<{ node: EntryNode }>,
  refOptionalfeature: RefOptionalFeatureNodeView as ComponentType<{ node: EntryNode }>,
  refFeat: RefFeatNodeView as ComponentType<{ node: EntryNode }>,
  options: OptionsNodeView as ComponentType<{ node: EntryNode }>,
  ingredient: IngredientNodeView as ComponentType<{ node: EntryNode }>,
  abilityDc: AbilityDcNodeView as ComponentType<{ node: EntryNode }>,
  abilityAttackMod: AbilityAttackModNodeView as ComponentType<{ node: EntryNode }>,
  abilityGeneric: AbilityGenericNodeView as ComponentType<{ node: EntryNode }>,
  hr: HrNodeView as ComponentType<{ node: EntryNode }>,
  flowchart: FlowchartNodeView as ComponentType<{ node: EntryNode }>,
  tableGroup: TableGroupNodeView as ComponentType<{ node: EntryNode }>,
  attack: AttackNodeView as ComponentType<{ node: EntryNode }>,
  variant: VariantNodeView as ComponentType<{ node: EntryNode }>,
  variantInner: VariantInnerNodeView as ComponentType<{ node: EntryNode }>,
  variantSub: VariantSubNodeView as ComponentType<{ node: EntryNode }>,
  inlineBlock: InlineBlockNodeView as ComponentType<{ node: EntryNode }>,
  inline: InlineNodeView as ComponentType<{ node: EntryNode }>,
  itemSub: ItemSubNodeView as ComponentType<{ node: EntryNode }>,
  itemSpell: ItemSpellNodeView as ComponentType<{ node: EntryNode }>,
  link: LinkNodeView as ComponentType<{ node: EntryNode }>,
  bonus: BonusNodeView as ComponentType<{ node: EntryNode }>,
  bonusSpeed: BonusSpeedNodeView as ComponentType<{ node: EntryNode }>,
  dice: DiceNodeView as ComponentType<{ node: EntryNode }>,
  row: RowNodeView as ComponentType<{ node: EntryNode }>,
  spellcasting: SpellcastingNodeView as ComponentType<{ node: EntryNode }>,
};
