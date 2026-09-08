import type { CompendiumRef, CompendiumRefKind } from './types.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Builds a CompendiumRef from an unknown blob shaped like `{ slug, source }`
 * (or `{ itemSlug, itemSource }` — via the caller-supplied field names).
 * Returns null for anything that doesn't carry both fields as non-empty
 * strings — malformed/partial entries are skipped rather than throwing, since
 * `data`/`inventory` are untrusted raw passthrough blobs.
 */
function refFrom(
  kind: CompendiumRefKind,
  raw: unknown,
  slugKey: string = 'slug',
  sourceKey: string = 'source',
): CompendiumRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const slug = record[slugKey];
  const source = record[sourceKey];
  if (!isNonEmptyString(slug) || !isNonEmptyString(source)) return null;
  return { kind, slug, source };
}

function dedupe(refs: CompendiumRef[]): CompendiumRef[] {
  const seen = new Set<string>();
  const out: CompendiumRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}|${ref.slug}|${ref.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * Extracts every compendium reference from a character's raw `data` JSONB and
 * `inventory` JSONB. Defensive by design: `data`/`inventory` are untrusted
 * passthrough blobs (possibly hand-edited before re-import), so every access
 * tolerates missing/malformed shapes instead of throwing. Malformed entries
 * are silently skipped — the caller (validateImportEnvelope) is responsible
 * for shape validation; this function only extracts what it can safely read.
 */
export function extractCompendiumRefs(
  data: Record<string, unknown>,
  inventory: unknown[],
): CompendiumRef[] {
  const refs: CompendiumRef[] = [];

  const race = refFrom('race', data['race']);
  if (race) refs.push(race);

  const subrace = refFrom('subrace', data['subrace']);
  if (subrace) refs.push(subrace);

  const classes = data['classes'];
  if (Array.isArray(classes)) {
    for (const entry of classes) {
      const classRef = refFrom('class', entry);
      if (classRef) refs.push(classRef);
      if (entry && typeof entry === 'object') {
        const subclassRef = refFrom('subclass', (entry as Record<string, unknown>)['subclass']);
        if (subclassRef) refs.push(subclassRef);
      }
    }
  }

  const background = refFrom('background', data['background']);
  if (background) refs.push(background);

  const spells = data['spells'];
  if (spells && typeof spells === 'object' && !Array.isArray(spells)) {
    for (const perClass of Object.values(spells as Record<string, unknown>)) {
      if (!perClass || typeof perClass !== 'object') continue;
      const buckets = perClass as Record<string, unknown>;
      for (const bucketKey of ['cantrips', 'known', 'prepared'] as const) {
        const bucket = buckets[bucketKey];
        if (!Array.isArray(bucket)) continue;
        for (const spellRaw of bucket) {
          const spellRef = refFrom('spell', spellRaw);
          if (spellRef) refs.push(spellRef);
        }
      }
    }
  }

  for (const item of inventory) {
    const itemRef = refFrom('item', item, 'itemSlug', 'itemSource');
    if (itemRef) refs.push(itemRef);
  }

  return dedupe(refs);
}
