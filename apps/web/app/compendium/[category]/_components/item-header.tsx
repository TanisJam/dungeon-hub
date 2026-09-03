// ItemHeader — per-type detail header for items (ADR-5, REQ-CBROWSE-07).
// Reads the API detail shape for items:
//   Extracted columns: id, slug, source, name, type, weight, reprintedAs, costCp
//   NOTE: The items detail endpoint STRIPS data JSONB and projects costCp instead
//   (see apps/api/src/http/routes/compendium.ts:546). The data field still exists
//   when passed through getCompendiumDetail (full row), but costCp is already projected.
//   Headers must read rarity and property from data.rarity / data.property[].
//
// PHB 2014 p.144-150 — equipment fields: type, weight, cost, rarity, properties.
//
// shopContext (market-shop-buy-ui 3c) — optional. Renders <ItemBuyControl> only when
// present; /mercado is the only caller that passes it, so /compendium stays browse-only.

import type { ShopContext } from '@/app/compendium/_components/types';
import { ItemBuyControl } from './item-buy-control';

// ---------------------------------------------------------------------------
// Item type labels (PHB p.144-150)
// ---------------------------------------------------------------------------
const ITEM_TYPE_LABELS: Record<string, string> = {
  A: 'Armor',
  AT: 'Artisan Tool',
  EXP: 'Explosive',
  FD: 'Food/Drink',
  G: 'Adventuring Gear',
  GS: 'Gaming Set',
  GV: 'Generic Variant',
  HA: 'Heavy Armor',
  INS: 'Musical Instrument',
  LA: 'Light Armor',
  M: 'Melee Weapon',
  MA: 'Medium Armor',
  MNT: 'Mount',
  OTH: 'Other',
  P: 'Potion',
  R: 'Ranged Weapon',
  RD: 'Rod',
  RG: 'Ring',
  S: 'Shield',
  SC: 'Scroll',
  SCF: 'Spellcasting Focus',
  SHP: 'Vehicle (Ship)',
  T: 'Tool',
  TAH: 'Tack & Harness',
  TG: 'Trade Good',
  VEH: 'Vehicle',
  WD: 'Wand',
};

function itemTypeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return ITEM_TYPE_LABELS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Cost formatter — costCp (copper pieces) → readable gp/sp/cp display
// PHB p.143 — 1 gp = 10 sp = 100 cp
// ---------------------------------------------------------------------------
export function costLabel(costCp: number | null | undefined): string {
  if (costCp == null) return '—';
  if (costCp === 0) return '0 cp';
  if (costCp % 100 === 0) return `${costCp / 100} gp`;
  if (costCp % 10 === 0) return `${costCp / 10} sp`;
  return `${costCp} cp`;
}

// ---------------------------------------------------------------------------
// Property codes → labels (PHB p.146-147)
// ---------------------------------------------------------------------------
const PROPERTY_LABELS: Record<string, string> = {
  A: 'Ammunition',
  F: 'Finesse',
  H: 'Heavy',
  L: 'Light',
  LD: 'Loading',
  R: 'Reach',
  RLD: 'Reload',
  S: 'Special',
  T: 'Thrown',
  '2H': 'Two-Handed',
  V: 'Versatile',
};

function propertyLabel(code: string): string {
  return PROPERTY_LABELS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Rarity label
// ---------------------------------------------------------------------------
function rarityLabel(rarity: string | null | undefined): string {
  if (!rarity || rarity === 'none') return 'Common';
  return rarity.charAt(0).toUpperCase() + rarity.slice(1).replace('-', ' ');
}

// ---------------------------------------------------------------------------
// MetaRow helper (same pattern as SpellHeader)
// ---------------------------------------------------------------------------

interface MetaRowProps {
  label: string;
  value: string;
  field: string;
}

function MetaRow({ label, value, field }: MetaRowProps) {
  return (
    <div className="meta-row">
      <div className="k">{label}</div>
      <div className="v" data-field={field}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API row shape (items detail — costCp already projected, data still present)
// ---------------------------------------------------------------------------

interface ItemDetailRow {
  slug: string;
  source: string;
  name: string;
  type: string | null;
  weight: string | null;
  costCp?: number | null;
  data?: {
    rarity?: string;
    property?: string[];
    value?: number;
    [key: string]: unknown;
  };
}

interface ItemHeaderProps {
  data: ItemDetailRow;
  shopContext?: ShopContext;
}

/**
 * ItemHeader — per-type detail header for items (ADR-5, REQ-CBROWSE-07).
 * Mobile-first @375px key/value grid.
 *
 * PHB 2014 p.144-150 — item meta fields: type, weight, cost, rarity, properties.
 */
export function ItemHeader({ data, shopContext }: ItemHeaderProps) {
  const weightStr = data.weight != null ? `${data.weight} lb.` : '—';
  const props = data.data?.property ?? [];
  const propsStr = props.length > 0 ? props.map(propertyLabel).join(', ') : '—';

  return (
    <div className="compendium-init-detail item">
      <div className="name">{data.name}</div>
      <div className="eyebrow" data-field="type">{itemTypeLabel(data.type)}</div>

      <div className="grid">
        <MetaRow label="Tipo" value={itemTypeLabel(data.type)} field="type" />
        <MetaRow label="Peso" value={weightStr} field="weight" />
        <MetaRow label="Coste" value={costLabel(data.costCp)} field="cost" />
        <MetaRow label="Rareza" value={rarityLabel(data.data?.rarity)} field="rarity" />
        {props.length > 0 && (
          <MetaRow label="Propiedades" value={propsStr} field="properties" />
        )}
        {props.length === 0 && (
          <MetaRow label="Propiedades" value="—" field="properties" />
        )}
      </div>

      {shopContext !== undefined && (
        <ItemBuyControl
          item={{ slug: data.slug, source: data.source }}
          costCp={data.costCp}
          shopContext={shopContext}
        />
      )}
    </div>
  );
}
