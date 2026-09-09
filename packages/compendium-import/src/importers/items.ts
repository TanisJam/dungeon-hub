import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsItem, NormalizedItem } from '../types.js';
import { resolveCopies } from '../resolve-copy.js';

interface ItemsFile {
  item?: FiveeToolsItem[];
  itemGroup?: FiveeToolsItem[];
  baseitem?: FiveeToolsItem[];
}

export async function importItems(
  dataDir: string,
  warnings: string[],
): Promise<NormalizedItem[]> {
  // items.json tiene magic items + grupos; items-base.json tiene mundane (espadas, armaduras base, etc.)
  const itemsMain = await readJson<ItemsFile>(join(dataDir, 'items.json'));
  const itemsBase = await readJson<ItemsFile>(join(dataDir, 'items-base.json'));

  const all: FiveeToolsItem[] = [
    ...(itemsMain.item ?? []),
    ...(itemsMain.itemGroup ?? []),
    ...(itemsBase.baseitem ?? []),
    ...(itemsBase.item ?? []),
  ];

  // Resolve `_copy` stubs (67 rows in the pinned dataset — e.g. rarity/attunement
  // variants of a base magic item) before building the normalized rows. Bases can
  // live in either file, so resolution runs over the merged + filtered array, and
  // chains recursively (some items themselves copy another `_copy` item).
  const filtered = all.filter((it) => !isExcludedSource(it.source));
  const resolved = resolveCopies(filtered, warnings, 'item');

  const out: NormalizedItem[] = [];
  const seen = new Set<string>(); // dedup por (slug, source) cuando aparece en ambos archivos

  for (const it of resolved) {
    const key = `${slugify(it.name)}|${it.source}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      slug: slugify(it.name),
      source: it.source,
      name: it.name,
      data: it,
      reprintedAs: parseReprintedAs(it.reprintedAs),
      type: it.type ?? null,
      weight: it.weight != null ? String(it.weight) : null,
    });
  }

  return out;
}
