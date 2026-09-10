/**
 * Attaches 5etools "fluff" (descriptive lore text) to already-normalized
 * records, as a NEW `data.fluff` key — never merged into `data.entries`,
 * which carries mechanical content (racial traits, background features).
 *
 * Scope, decided by measuring text availability across the pinned dataset:
 * races, backgrounds and classes only. Items, feats and languages fluff is
 * almost entirely images-only (5etools CDN URLs we neither host nor
 * hotlink) and is deliberately NOT imported here. Subclass fluff is also
 * out of scope — most subclasses carry no fluff text.
 *
 * Reading fluff files does NOT go through `listFiles()`'s ordinary
 * category listing (which deliberately filters out `fluff-*` for every
 * other importer) — it reads the flat fluff files directly, and opts back
 * into `fluff-*` via `listFiles`'s `includeFluff` option for the
 * per-class fluff files.
 */
import { join } from 'node:path';
import { listFiles, readJson } from './reader.js';
import { isExcludedSource } from './normalize.js';
import { resolveCopies } from './resolve-copy.js';
import type { NormalizedRecord } from './types.js';

/**
 * Raw shape of one 5etools fluff row — same `name`/`source`/`_copy` shape
 * as the main data, plus `entries` (the lore text) and `images` (CDN URLs
 * we discard).
 */
export interface FluffRow {
  name: string;
  source: string;
  entries?: unknown[];
  images?: unknown[];
  _copy?: unknown;
}

interface RaceFluffFile {
  raceFluff?: FluffRow[];
}

interface BackgroundFluffFile {
  backgroundFluff?: FluffRow[];
}

interface ClassFluffFile {
  classFluff?: FluffRow[];
}

/** Per-class fluff files whose corresponding class file we never import. */
const SKIP_CLASS_FLUFF_FILES = new Set(['fluff-class-mystic.json', 'fluff-class-sidekick.json']);

function normKey(name: string, source: string): string {
  return `${name.trim().toLowerCase()}|${source.trim().toLowerCase()}`;
}

/**
 * Resolves `_copy` on a raw fluff array (same mechanism as the main data —
 * reuses `resolveCopies()`, never a second resolver), then builds a
 * `"name|source"` (trimmed, lower-cased) → `entries` lookup, keeping only
 * rows that actually resolved to non-empty text. Rows whose `entries`
 * stayed empty after resolution (images-only fluff, or an unresolved
 * `_copy` — already warned about by `resolveCopies`) are dropped here:
 * they must never produce an empty `data.fluff` array.
 */
export function buildFluffMap(rows: FluffRow[], warnings: string[], kind: string): Map<string, unknown[]> {
  const filtered = rows.filter((r) => !isExcludedSource(r.source));
  const resolved = resolveCopies(filtered, warnings, kind);

  const map = new Map<string, unknown[]>();
  for (const row of resolved) {
    const entries = row.entries;
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const key = normKey(row.name, row.source);
    // First entry for a given key wins (mirrors resolveCopies' `byKey`,
    // which also keeps the first row on a duplicate key).
    if (!map.has(key)) map.set(key, entries);
  }
  return map;
}

/**
 * Matches `record` against `fluffMap` and returns its lore entries, or
 * `undefined` when there is none.
 *
 * Tries the direct `name|source` key first. Subraces need a second key
 * form: their fluff is filed under `"<raceName> (<name>)"`, not `"<name>"`
 * — e.g. `Asmodeus[MTF]` (whose `data.raceName` is `"Tiefling"`) matches
 * the fluff record named `"Tiefling (Asmodeus)"`. `raceName` lives in
 * `record.data` because the race importer spreads the raw 5etools subrace
 * row (which carries `raceName`) into `data` — no importer change needed.
 */
export function findFluffMatch(record: NormalizedRecord, fluffMap: Map<string, unknown[]>): unknown[] | undefined {
  const direct = fluffMap.get(normKey(record.name, record.source));
  if (direct) return direct;

  const data = record.data as Record<string, unknown> | null | undefined;
  const raceName = data && typeof data === 'object' ? data['raceName'] : undefined;
  if (typeof raceName === 'string' && raceName.length > 0) {
    const composedName = `${raceName} (${record.name})`;
    return fluffMap.get(normKey(composedName, record.source));
  }

  return undefined;
}

/**
 * Attaches `data.fluff` in place to every record in `records` that has a
 * match in `fluffMap`. Records with no match are left untouched — they
 * simply have no `fluff` key.
 */
export function attachFluff(records: NormalizedRecord[], fluffMap: Map<string, unknown[]>): void {
  for (const record of records) {
    const match = findFluffMatch(record, fluffMap);
    if (!match) continue;
    record.data = { ...(record.data as Record<string, unknown>), fluff: match };
  }
}

/**
 * Reads `fluff-races.json` and attaches `data.fluff` to every matching
 * race/subrace row in `races` (mutated in place).
 */
export async function attachRaceFluff(
  dataDir: string,
  races: NormalizedRecord[],
  warnings: string[],
): Promise<void> {
  const file = await readJson<RaceFluffFile>(join(dataDir, 'fluff-races.json'));
  const fluffMap = buildFluffMap(file.raceFluff ?? [], warnings, 'race fluff');
  attachFluff(races, fluffMap);
}

/**
 * Reads `fluff-backgrounds.json` and attaches `data.fluff` to every
 * matching background row in `backgrounds` (mutated in place).
 */
export async function attachBackgroundFluff(
  dataDir: string,
  backgrounds: NormalizedRecord[],
  warnings: string[],
): Promise<void> {
  const file = await readJson<BackgroundFluffFile>(join(dataDir, 'fluff-backgrounds.json'));
  const fluffMap = buildFluffMap(file.backgroundFluff ?? [], warnings, 'background fluff');
  attachFluff(backgrounds, fluffMap);
}

/**
 * Reads every `class/fluff-class-*.json` file, merges their `classFluff`
 * arrays into one logical array (fluff files never reference a base across
 * files, but this stays consistent with resolving one array per category),
 * and attaches `data.fluff` to every matching class row in `classes`
 * (mutated in place). Subclass fluff (`subclassFluff`, in the same files)
 * is intentionally never read — it is out of scope.
 */
export async function attachClassFluff(
  dataDir: string,
  classes: NormalizedRecord[],
  warnings: string[],
): Promise<void> {
  const files = (await listFiles(dataDir, 'class', /^fluff-class-.+\.json$/, { includeFluff: true })).filter(
    (path) => !SKIP_CLASS_FLUFF_FILES.has(path.split('/').pop() ?? ''),
  );

  const allRows: FluffRow[] = [];
  for (const path of files) {
    const file = await readJson<ClassFluffFile>(path);
    allRows.push(...(file.classFluff ?? []));
  }

  const fluffMap = buildFluffMap(allRows, warnings, 'class fluff');
  attachFluff(classes, fluffMap);
}
