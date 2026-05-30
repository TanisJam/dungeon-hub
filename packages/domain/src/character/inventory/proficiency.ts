import type { ItemCompendiumLite } from './types.js';

/**
 * Clasifica un item según el `type` de 5etools.
 *
 * Códigos relevantes para profs (5etools items):
 *   LA / MA / HA → armor (light/medium/heavy)
 *   S            → shield
 *   M / R        → melee / ranged weapons
 *   $ G GS WD etc → other gear (no requiere prof)
 */
export type ItemKind = 'armor-light' | 'armor-medium' | 'armor-heavy' | 'shield' | 'weapon' | 'other';

export function classifyItem(item: ItemCompendiumLite): ItemKind {
  const t = (item.type ?? '').trim().toUpperCase();
  if (t === 'LA') return 'armor-light';
  if (t === 'MA') return 'armor-medium';
  if (t === 'HA') return 'armor-heavy';
  if (t === 'S') return 'shield';
  if (t === 'M' || t === 'R') return 'weapon';
  return 'other';
}

/**
 * Strippea `{@tag value|extra}` quedándose con `value`. Necesario porque 5etools
 * a veces almacena prof strings tipo `{@item longsword|phb}`.
 */
export function stripFiveeToolsTag(s: string): string {
  return s.replace(/\{@[^\s}]+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1');
}

function normalize(s: string): string {
  return stripFiveeToolsTag(s).toLowerCase().trim();
}

/** ¿Las profs incluyen "light armor" / "all armor" / etc.? */
function hasArmorCategory(profs: string[], category: 'light' | 'medium' | 'heavy'): boolean {
  const set = new Set(profs.map(normalize));
  if (set.has('all armor')) return true;
  if (set.has(`${category} armor`)) return true;
  if (set.has(category)) return true;
  return false;
}

function hasShield(profs: string[]): boolean {
  const set = new Set(profs.map(normalize));
  return set.has('shields') || set.has('shield');
}

/**
 * Core weapon proficiency check — exported pure helper.
 *
 * ADR-5 (engine-action-pipeline): extracted from the previously-private
 * `hasWeaponProficiency` so that use-cases can call it with the lean
 * `{name, slug}` shape (no full ItemCompendiumLite needed).
 *
 * A weapon prof matches when:
 *   - The character has a blanket category: 5etools stores "simple" / "martial"
 *     (singular, no suffix); also accepts "simple weapons" / "martial weapons"
 *     for alternative storage conventions.
 *   - The character names the item specifically: prof === item.name or prof === item.slug.
 *
 * Distinguishing simple vs. martial requires `weaponCategory` from the compendium,
 * which is not available here. Permissive: any blanket weapon prof covers any weapon.
 * Refine in a future slice if category discrimination is needed.
 *
 * PHB p.146-149 — Proficiencies: characters proficient in a weapon add proficiency
 * bonus to attack rolls; non-proficient characters do not.
 */
export function isWeaponProficient(
  weaponProfs: string[],
  weapon: { name: string; slug: string },
): boolean {
  const normalizedProfs = weaponProfs.map(normalize);
  const blanket = new Set(['simple', 'martial', 'simple weapons', 'martial weapons']);
  if (normalizedProfs.some((p) => blanket.has(p))) return true;
  const itemName = weapon.name.toLowerCase().trim();
  const itemSlug = weapon.slug.toLowerCase().trim();
  return normalizedProfs.some((p) => p === itemName || p === itemSlug);
}

/**
 * Internal wrapper kept for backward compat with checkEquippedProficiency.
 * Delegates to the exported isWeaponProficient.
 */
function hasWeaponProficiency(profs: string[], item: ItemCompendiumLite): boolean {
  return isWeaponProficient(profs, { name: item.name, slug: item.slug });
}

export interface ProficiencyCheck {
  proficient: boolean;
  /** Para construir el warning. 'other' significa que no aplica check (gear no marcial). */
  kind: 'armor' | 'shield' | 'weapon' | 'other';
}

export function checkEquippedProficiency(
  item: ItemCompendiumLite,
  ctx: { armorProficiencies: string[]; weaponProficiencies: string[] },
): ProficiencyCheck {
  const k = classifyItem(item);
  switch (k) {
    case 'armor-light':
      return { kind: 'armor', proficient: hasArmorCategory(ctx.armorProficiencies, 'light') };
    case 'armor-medium':
      return { kind: 'armor', proficient: hasArmorCategory(ctx.armorProficiencies, 'medium') };
    case 'armor-heavy':
      return { kind: 'armor', proficient: hasArmorCategory(ctx.armorProficiencies, 'heavy') };
    case 'shield':
      return { kind: 'shield', proficient: hasShield(ctx.armorProficiencies) };
    case 'weapon':
      return { kind: 'weapon', proficient: hasWeaponProficiency(ctx.weaponProficiencies, item) };
    case 'other':
      return { kind: 'other', proficient: true };
  }
}
