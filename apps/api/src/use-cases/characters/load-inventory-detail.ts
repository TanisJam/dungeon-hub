/**
 * load-inventory-detail — use-case for GET /characters/:id/inventory/:instanceId/detail.
 *
 * Reqs: ACIDE-SHAPE-01, ACIDE-AUTH-02, ACIDE-NONN1-03 (spec #1070)
 * Design: DB1, DB2, DB3 (design #1071)
 *
 * Dispatches to the correct renderer variant based on `v3Type`.
 * Calls loadItemDataDetailMany([{slug, source}]) — single batch call, zero N+1.
 */
import {
  deriveV3Type,
  normalizeRarity,
  formatArmorDexCap,
  type InventoryItem,
} from '@dungeon-hub/domain/character/inventory';
import {
  computeWeaponAttackBonus,
} from '@dungeon-hub/domain/character/weapon';
import {
  abilityModifier,
  computeEffectiveScores,
} from '@dungeon-hub/domain/character/multiclass';
import { proficiencyBonus } from '@dungeon-hub/domain/character/sheet';
import type { AbilityScores } from '@dungeon-hub/domain/character/stats';
import type { AppliedAsi } from '@dungeon-hub/domain/character/race';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import type { AppliedFeat } from '@dungeon-hub/domain/character/feat';
import { getCharacterAccess, loadCharacter } from './load-character.js';
import { loadItemDataDetailMany } from './load-item-data.js';

// ── Shared fields on every InventoryDetailResponse variant ───────────────────

interface DetailCommon {
  instanceId: string;
  v3Type: string;
  displayName: string;
  subtitle: string | null;
  rarity: string | null;
  magicFlag: boolean;
  equipped: boolean;
  weightLb: number | null;
  costCp: number | null;
  qty: number;
  notes: string;
  historyHeadline: null;
  historyDetail: null;
}

// ── Per-type variants ─────────────────────────────────────────────────────────

export interface WeaponDetailVariant extends DetailCommon {
  v3Type: 'weapon';
  attackBonus: number;
  dmg1: string | null;
  dmgType: string | null;
  range: string | null;
  properties: string[];
  magicBonus: number;
}

export interface ArmorDetailVariant extends DetailCommon {
  v3Type: 'armor';
  acBase: number | null;
  armorCategory: string | null;
  dexCapNote: string;
  stealth: boolean;
  donTime: string;
  armorStrengthMin: number;
}

export interface ConsumableDetailVariant extends DetailCommon {
  v3Type: 'consumable';
  charges: number | null;
  chargesMax: number | null;
  entriesSummary: string | null;
  actionCost: string;
}

export interface FoodDetailVariant extends DetailCommon {
  v3Type: 'food';
  servings: number;
  foodKind: string;
  consumeNote: string | null;
}

export interface IncompleteDetailVariant extends DetailCommon {
  v3Type: 'incomplete';
}

export type InventoryDetailResponse =
  | WeaponDetailVariant
  | ArmorDetailVariant
  | ConsumableDetailVariant
  | FoodDetailVariant
  | IncompleteDetailVariant;

// ── Don time table (PHB p.144) ────────────────────────────────────────────────

function donTimeByCategory(category: string | null): string {
  switch (category) {
    case 'LA': return '1 acción';
    case 'MA': return '5 min';
    case 'HA': return '10 min';
    case 'S':  return '1 acción';
    default:   return '1 acción';
  }
}

// ── Effective ability scores helper ──────────────────────────────────────────

function effectiveScores(charData: Record<string, unknown>): { str: number; dex: number } & AbilityScores {
  const baseStats = (charData['baseStats'] as AbilityScores | undefined) ?? {
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  };
  const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
  const levelUpAsis = (charData['levelUpAsis'] as AppliedAsi[] | undefined) ?? [];
  const featAsis = ((charData['feats'] as AppliedFeat[] | undefined) ?? []).flatMap((f) =>
    f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
  );
  return computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);
}

function totalLevel(charData: Record<string, unknown>): number {
  const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
  return classes.reduce((sum, c) => sum + (c.level ?? 0), 0);
}

// ── Main use-case ─────────────────────────────────────────────────────────────

export async function loadInventoryDetail(input: {
  characterId: string;
  instanceId: string;
  userId: string;
}): Promise<
  | { ok: true; detail: InventoryDetailResponse }
  | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'INSTANCE_NOT_FOUND' | 'ITEM_NOT_FOUND' | 'INCOMPLETE_DATA' }
> {
  const character = await loadCharacter(input.characterId);
  if (!character) return { ok: false, code: 'NOT_FOUND' };

  const access = await getCharacterAccess(character, input.userId);
  if (access === 'none') return { ok: false, code: 'FORBIDDEN' };

  const inventory = (character.inventory as InventoryItem[] | null) ?? [];
  const instance = inventory.find((it) => it.instanceId === input.instanceId);
  if (!instance) return { ok: false, code: 'INSTANCE_NOT_FOUND' };

  // ACIDE-NONN1-03: single-element batch call — zero N+1.
  const [detail] = await loadItemDataDetailMany([
    { slug: instance.itemSlug, source: instance.itemSource },
  ]);
  if (!detail) return { ok: false, code: 'ITEM_NOT_FOUND' };

  // ACVT-DERIVE-01: pass instance.v3TypeOverride so DM overrides propagate to detail dispatch.
  const v3Type = deriveV3Type(detail, instance.v3TypeOverride ?? null);
  const rarity = normalizeRarity(detail.rarity);
  const reqAttune = detail.reqAttune ?? null;
  const magicFlag = (rarity != null && rarity !== 'common') || reqAttune != null;
  const charData = (character.data as Record<string, unknown> | null) ?? {};

  const common: DetailCommon = {
    instanceId: instance.instanceId,
    v3Type,
    displayName: instance.customName ?? detail.name,
    subtitle: detail.type ?? null,
    rarity,
    magicFlag,
    equipped: instance.state === 'equipped',
    weightLb: detail.weight,
    costCp: detail.costCp ?? null,
    qty: instance.quantity,
    notes: instance.notes ?? '',
    historyHeadline: null,
    historyDetail: null,
  };

  switch (v3Type) {
    case 'weapon': {
      const effective = effectiveScores(charData);
      const strMod = abilityModifier(effective.str);
      const dexMod = abilityModifier(effective.dex);
      const level = totalLevel(charData);
      const pb = proficiencyBonus(level > 0 ? level : 1);
      // Slice B: isProficient=true as default (proficiency per-weapon check is a future SDD).
      // TODO(Slice C): wire weapon proficiency check via checkEquippedProficiency.
      const attackBonus = computeWeaponAttackBonus({
        strMod,
        dexMod,
        proficiencyBonus: pb,
        isProficient: true,
        weaponCategory: detail.type === 'R' ? 'ranged' : 'melee',
        properties: detail.property ?? [],
        magicBonus: 0, // DB2: magic bonus deferred to Slice C.
      });

      return {
        ok: true,
        detail: {
          ...common,
          v3Type: 'weapon',
          attackBonus,
          dmg1: detail.dmg1,
          dmgType: detail.dmgType,
          range: detail.range,
          properties: detail.humanizedProperties,
          magicBonus: 0,
        },
      };
    }

    case 'armor': {
      return {
        ok: true,
        detail: {
          ...common,
          v3Type: 'armor',
          acBase: detail.ac ?? null,
          armorCategory: detail.type ?? null,
          dexCapNote: formatArmorDexCap(detail.type ?? null),
          stealth: detail.stealth ?? false,
          donTime: donTimeByCategory(detail.type ?? null),
          armorStrengthMin: detail.armorStrengthMin ?? 0,
        },
      };
    }

    case 'consumable': {
      return {
        ok: true,
        detail: {
          ...common,
          v3Type: 'consumable',
          charges: instance.charges ?? null,
          chargesMax: detail.charges ?? null,
          entriesSummary: detail.entriesSummary,
          actionCost: '1 acción',
        },
      };
    }

    case 'food': {
      return {
        ok: true,
        detail: {
          ...common,
          v3Type: 'food',
          servings: 1, // TODO(Slice C): map from compendium metadata if available.
          foodKind: detail.type === 'FD' ? 'Ración' : 'Alimento',
          consumeNote: detail.entriesSummary,
        },
      };
    }

    default: {
      // ERB2: 'incomplete' variant for magic, trinket, book, quest, unknown
      return {
        ok: true,
        detail: {
          ...common,
          v3Type: 'incomplete',
        } as IncompleteDetailVariant,
      };
    }
  }
}
