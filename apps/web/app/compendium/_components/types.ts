export type CategoryId =
  | 'spells'
  | 'items'
  | 'races'
  | 'classes'
  | 'monsters'
  | 'lore';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  icon: string;
  /** Modifier CSS class for tint (e.g. 'spell', 'lore') */
  cls: string;
}

export interface RecentDef {
  id: string;
  name: string;
  sub: string;
  icon: string;
  /** Modifier CSS class for row tint */
  cls: string;
}

export interface SpellMeta {
  k: string;
  v: string;
}

export interface SpellDetail {
  level: number;
  eyebrow: string;
  name: string;
  school: string;
  meta: SpellMeta[];
  paragraphs: string[];
}
