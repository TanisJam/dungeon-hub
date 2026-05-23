/**
 * Tipos parciales del shape de 5etools. Solo cubrimos los campos que usamos.
 * El resto del payload se guarda en `data JSONB` y se accede on-demand.
 */

/**
 * 5etools admite dos formatos en reprintedAs:
 *   - "Name|Source" (string)
 *   - { uid: "Name|Source", tag: "feat" } (cuando el reprint cambia de tipo)
 */
export type ReprintedAsEntry = string | { uid?: string; tag?: string };

export interface FiveeToolsBase {
  name: string;
  source: string;
  page?: number;
  reprintedAs?: ReprintedAsEntry[];
  /** Algunos archivos marcan UA / playtest. */
  srd?: boolean;
  basicRules?: boolean;
}

export interface FiveeToolsRace extends FiveeToolsBase {
  size?: string[];
  speed?: number | Record<string, number>;
  ability?: Array<Record<string, number>>;
  traitTags?: string[];
  languageProficiencies?: Array<Record<string, boolean | number>>;
  entries?: unknown[];
}

export interface FiveeToolsSubrace extends FiveeToolsBase {
  raceName: string;
  raceSource: string;
  ability?: Array<Record<string, number>>;
  entries?: unknown[];
}

export interface FiveeToolsClass extends FiveeToolsBase {
  hd?: { number: number; faces: number };
  proficiency?: string[];
  startingProficiencies?: Record<string, unknown>;
  classFeatures?: unknown[];
  subclassTitle?: string;
}

export interface FiveeToolsSubclass extends FiveeToolsBase {
  shortName?: string;
  className: string;
  classSource: string;
  subclassFeatures?: unknown[];
}

export interface FiveeToolsBackground extends FiveeToolsBase {
  skillProficiencies?: unknown[];
  languageProficiencies?: unknown[];
  toolProficiencies?: unknown[];
  entries?: unknown[];
}

export interface FiveeToolsSpell extends FiveeToolsBase {
  level: number;
  school: string;
  time?: unknown[];
  range?: unknown;
  components?: Record<string, unknown>;
  duration?: unknown[];
  classes?: { fromClassList?: Array<{ name: string; source: string }> };
  entries?: unknown[];
}

export interface FiveeToolsItem extends FiveeToolsBase {
  type?: string;
  weight?: number;
  weaponCategory?: string;
  property?: string[];
  rarity?: string;
  reqAttune?: boolean | string;
}

export interface FiveeToolsFeat extends FiveeToolsBase {
  prerequisite?: Array<Record<string, unknown>>;
  ability?: Array<Record<string, number>>;
  entries?: unknown[];
}

/**
 * Forma normalizada que devolvemos al consumidor (apps/api).
 * El consumidor hace upsert en su DB.
 */
export interface NormalizedRecord {
  slug: string;
  source: string;
  name: string;
  /** Si la entidad fue reimpresa: lista de "slug|SOURCE" normalizados de los reemplazos. */
  reprintedAs: string[] | null;
  /** Payload original completo de 5etools. */
  data: unknown;
}

export interface NormalizedRace extends NormalizedRecord {
  isSubrace: boolean;
  parentSlug: string | null;
  parentSource: string | null;
}

export interface NormalizedSubclass extends NormalizedRecord {
  classSlug: string;
  classSource: string;
}

export interface SubclassGrant {
  classSlug: string;
  classSource: string;
  subclassSlug: string;
  subclassSource: string;
  /** Nombre original del subclass (para display). Ej. "Light Domain". */
  subclassName: string;
}

export interface NormalizedSpell extends NormalizedRecord {
  level: number;
  school: string;
  /** Solo clases BASE que tienen el spell en su lista canónica. */
  classes: string[];
  /** Subclases que otorgan el spell como bonus (NO está en la lista base). */
  subclassGrants: SubclassGrant[];
}

export interface NormalizedItem extends NormalizedRecord {
  type: string | null;
  weight: string | null; // numeric → string para preservar precisión
}

export interface NormalizedFeat extends NormalizedRecord {
  prerequisites: unknown | null;
}

/**
 * Subset del shape de 5etools para monsters. El resto del payload se guarda
 * tal cual en `data` JSONB.
 */
export interface FiveeToolsMonster extends FiveeToolsBase {
  size?: string[];
  type?: string | { type: string; tags?: string[] };
  /** CR puede ser string "1/4" o un objeto {cr, lair?, coven?} con la base. */
  cr?: string | { cr: string; lair?: string; coven?: string };
  /** Cuando viene como _copy, el monster es una variante de otro (skip por ahora). */
  _copy?: unknown;
}

export interface NormalizedMonster extends NormalizedRecord {
  /** CR display ("1/8", "1/4", "10"). null si el monster no tiene CR fijo. */
  cr: string | null;
  /** CR numérico para sort/filter (0.125, 0.25, 10). null si cr es null. */
  crNumeric: number | null;
  /** Type primario lowercase, sin tags (ej. "dragon", "fiend"). null si missing. */
  type: string | null;
  /** Size code ("T"/"S"/"M"/"L"/"H"/"G"). Primer elemento si el monster es multi-size. */
  size: string | null;
}

export interface FiveeToolsOptionalFeature extends FiveeToolsBase {
  featureType?: string[];
  prerequisite?: Array<Record<string, unknown>>;
  entries?: unknown[];
}

export interface NormalizedOptionalFeature extends NormalizedRecord {
  featureType: string[];
  prerequisites: unknown | null;
}

export interface FiveeToolsCondition extends FiveeToolsBase {
  entries?: unknown[];
  hasFluffImages?: boolean;
}

export interface FiveeToolsLanguage extends FiveeToolsBase {
  type?: 'standard' | 'exotic' | 'secret';
  script?: string;
  typicalSpeakers?: unknown[];
  entries?: unknown[];
}

export interface FiveeToolsAction extends FiveeToolsBase {
  time?: unknown[];
  entries?: unknown[];
  seeAlsoAction?: string[];
}

export interface NormalizedCondition extends NormalizedRecord {
  kind: 'condition' | 'status';
}

export interface NormalizedLanguage extends NormalizedRecord {
  type: string | null;
  script: string | null;
}

export type NormalizedAction = NormalizedRecord;

export interface ImportResult {
  races: NormalizedRace[];
  classes: NormalizedRecord[];
  subclasses: NormalizedSubclass[];
  backgrounds: NormalizedRecord[];
  spells: NormalizedSpell[];
  items: NormalizedItem[];
  feats: NormalizedFeat[];
  optionalFeatures: NormalizedOptionalFeature[];
  monsters: NormalizedMonster[];
  conditions: NormalizedCondition[];
  languages: NormalizedLanguage[];
  actions: NormalizedAction[];
  warnings: string[];
}
