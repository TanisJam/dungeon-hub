import type { ComponentType } from 'react';
import type { EntryNode } from '../types';
import { EntriesNodeView } from './entries';
import { ListNodeView } from './list';
import { ItemNodeView } from './item';
import { TableNodeView } from './table';

/**
 * Phase A registry. Each subsequent phase registers more node types here.
 * Order doesn't matter — the dispatcher looks up by node.type.
 */
export const NODE_REGISTRY: Partial<Record<string, ComponentType<{ node: EntryNode }>>> = {
  // Tier 1 — Phase A
  entries: EntriesNodeView as ComponentType<{ node: EntryNode }>,
  list: ListNodeView as ComponentType<{ node: EntryNode }>,
  item: ItemNodeView as ComponentType<{ node: EntryNode }>,
  table: TableNodeView as ComponentType<{ node: EntryNode }>,
};
