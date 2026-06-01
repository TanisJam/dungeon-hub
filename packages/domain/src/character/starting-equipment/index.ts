export type {
  ChoiceRow,
  ClassStartingEquipment,
  BackgroundStartingEquipment,
  EquipmentType,
  EquipmentTypeQuerySpec,
  EquipmentSelections,
  GrantSpec,
  ItemRef,
  ItemRefString,
  ItemRefQuantity,
  ItemRefDisplayName,
  ItemRefContainsValue,
  ItemRefEquipmentType,
  ItemRefEquipmentTypeQuantity,
  ItemRefSpecial,
} from './shape.js';

export { EQUIPMENT_TYPE_QUERY_MAP } from './shape.js';

// ─── Parse ────────────────────────────────────────────────────────────────────
export type {
  ParsedClassEquipment,
  ParsedBackgroundEquipment,
  ParsedChoiceRow,
  ParsedOption,
  ParsedRef,
  ParsedItemGrant,
  ParsedCategoryRef,
  ParsedSpecialRef,
} from './parse.js';

export {
  parseClassStartingEquipment,
  parseBackgroundStartingEquipment,
} from './parse.js';

// ─── Resolve ──────────────────────────────────────────────────────────────────
export type { ResolveResult, ResolveValidationIssue } from './resolve.js';
export { resolveStartingGrant } from './resolve.js';

// ─── Roll Gold ────────────────────────────────────────────────────────────────
export { rollStartingGold } from './roll-gold.js';
