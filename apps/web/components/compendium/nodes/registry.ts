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
};
